# The plan's shipped batches

Moved here from `PLAN.md` on 2026-10-04, so that a session reads only the work that is
still open (`PLAN.md` had grown to 4,462 lines, about 40k tokens, and a session pays for
whatever it reads on every step after). Each batch is kept whole, with its measurements
and the reasons behind each choice, because later items and the code's comments cite
them ("batch 3's gate", "the 4–8 px structure"). The section numbers are `PLAN.md`'s;
each one there keeps a stub saying it shipped, and any item still open in it.

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

The owner chose "Both": the projector look on the plate and the flipped, many-coloured
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

*Proposed 2026-09-28:* **record the whole set, render it afterwards.** A take today is
the gestures painted with the laptop's primary pointer, at about 15 Hz
(`performanceTake.ts`; "Feed the performance recorder" in `LiquidVisualizer.tsx`): no
settings, no Go or Back, no Mixer takes, blackout or tempo, and no phone, OSC or
gamepad hands. Log all of it with the seed, write the audio to disk as it plays, and
afterwards render the set through the existing Render path at 1080p or 4K. As the
caution above says, it would be the same decisions, not the same pixels. The phone's
hands already go through `performGesture`, so they are logged with the rest, and its
Record toggle arms "log the set". *Measure:* `npm run render` of a logged two-minute
set holds the live log's Go times and look names.

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
the glass, so the beat squeeze works on it; moving → `blow` along its velocity;
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

*Proposed 2026-09-28:* **pictures, not swatches, in the cue list.** In the dark a look is
picked by its name and one colour swatch (`lookSwatch`, `PhoneStage.tsx`, and the desk's
pick lists). `gallery.yml` already photographs every preset; ship those photographs as
thumbnails, and have Save Look keep a still of the plate in the preset file, sent to a
receiver once rather than in every cast state (the lesson of S0's logo, in
`docs/stability-plan.md`). The phone's Looks sheet, where rows are smallest, gains most.
*Measure:* `npm run desk` and `npm run phone` find a picture on every built-in look's
row; the cast state's size is unchanged.

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

**Shipped** (2026-09-27). `lib/drawGate.ts` stamps every draw, the show's own frame
or the projector's ask, and turns down any offer within 0.6 of a refresh of the last
draw. The refresh is the median of the faster clock's own recent gaps (each window's
offers, drawn or not, so the gate's own skipping cannot talk it down), never shorter
than 240 Hz's and with no slow bound (a first bound at 30 Hz let two clocks at 20 a
second both through, 40.0 draws a second, tried), 60 Hz until measured. Three changes
from the fix as written, each found red first:

- *The show's own frames are gated too*, while the projector is asking. With the asks
  alone gated, a projector more than 0.6 of a refresh behind still doubles (its ask
  draws, and the show's next frame lands 0.4 of a refresh later), which is 40 % of
  the phases a drifting projector passes through: 120 draws a second in the
  arithmetic where the gate draws 60, and 113.6 in the app at ¾ of a refresh.
- *Nothing is gated unless both clocks are running*, so with no wall every one of the
  show's frames draws, and with the show covered every ask draws, however ragged a
  busy machine makes them. A gate on the asks alone drew 61 of 121 covered asks
  handed over alternately on time and 12 ms late, each missing one a frame the wall
  shows twice.
- *Every offer carries its refresh's own time*, not the time its callback ran: the
  show's frames their `requestAnimationFrame` timestamp, the projector's asks its own,
  moved onto the show's clock by the two windows' `timeOrigin`s (`CastDisplay`), and
  the time now for an ask with none. Both windows share one main thread, so when both
  clocks land in one refresh the second callback runs after the first one's draw; the
  first version stamped with `performance.now()` there, and once a draw cost more than
  0.6 of a refresh the second looked like the next refresh's and drew too (found in
  review: 87 a second at 60 Hz with 10.5 ms draws), and the governor was fed the draw's
  own cost as the interval.

Only let-through frames reach the loop, so the governor's `frameS` is the interval
between real draws; an ask that is turned down does not offer the ear a reading either
(one reading per drawn frame, 14a).

`npm run wall` measures it twice, and holds every rate to a floor as well as a
ceiling (a gate that froze the plate, or turned down one frame in two, passed the
ceilings alone in review). In arithmetic (node, one main thread with a draw cost):
laptop and projector at 60/60, 60/59.94, 120/60, 60/120, 60/50, and a busy 28/28 and
20/20 Hz, twenty phases each, with and without 2 ms of jitter, with free draws and
with draws of 0.7 of a refresh: between 0.99 and 1.02 times the faster display at
every phase (27.7 to 28.3 on 28/28, 59.7 to 60.3 on 60/60); the old guard 1.25 to 2.0
times it on the same clocks (120 on 60/60, 180 on 120/60); the gate stamped with when
its callback ran 80.0 on 60/60 and 156.0 on 120/60 once draws cost 0.7 of a refresh;
the median interval fed to the governor a whole refresh (16.7 ms; the old guard 0 to
11.7, stamped when run 11.7); covered, every ask of a 30, 60 and 120 Hz projector
draws, and every one of asks 20 to 200 ms apart.

In the app: the real projector window (`?cast=true`), both windows animating, the
projector's frames handed to it 0, ¼, ½ and ¾ of a refresh late to stand in for a
second display's clock. On this tree, one run each:

| | before (the old guard) | the first gate (stamped when run) | after |
|---|---|---|---|
| the four phases, draws a second | 120.0, 120.1, 120.2, 119.1 (2.0×) | 59.7 to 60.4 | 59.9, 60.3, 59.8, 59.8 (1.0×) |
| draws of 11.7 ms, both on one refresh | 72.3 (2.0× the 36.1 the held thread managed) | 68.7 (1.3×) | 60.0 (1.0×) |
| covered, projector's frames ragged | 61 of 121 asks drawn | 120 of 120 | 120 of 120 |

With every phase: at least 0.9 times what the show drew alone (since 14b-2 below,
what either window was handed in the same two seconds; a gate turning
everything down drew 0.0, one at 1.3 of a refresh 29.9 to 39.9, against 53.8), and
about one offer turned down a refresh (59.8 to 60.3 a second), which is what says both
clocks were running. `npm run ears` 26/26 (123 asks read over 123 frames asked for).
Counted, not photographed, so the app half runs in a cloud session with no GPU at all:
there the loop is started by the projector's first ask and runs on the show's frames
from then on, and there is no governor to read.

On the Mac runner, with a renderer up (#203's run on a9ba205), each window was
handed 50.5 to 56.4 of a 60 Hz display's refreshes a second, the gate drew 51.5 to
55.4, and the governor was fed a median 17.0 ms at half a refresh behind. The
display's rate misleads there, so the wall's ceiling and the governor's bar are no
longer taken from it. They are taken from the refreshes either window was handed,
counted in slots as the gate spaces its draws: the wall's refreshes at the time its
frames are handed over, and a new slot only 0.6 of a refresh after the last began.
Draws are held to 1.05 of the slots, and the governor's median to 0.9 of the median
gap between them. Matching the two windows' timestamps instead (tried first) reads a
working gate as doubling at ¾ of a refresh behind whenever both windows miss a
refresh, which a busy Mac does: two reviewers modelled 1.03 to 1.2 times at 3 to 30 %
of refreshes missed. Controls on this tree, in a cloud session: the gate stamped when
its callback ran, with 11.6 ms draws, 68.6 and 71.4 drawn for 59.8 and 59.5 slots
(1.15 and 1.20, red; it passed the display's ceiling at 65.8). A gate that never
turns anything down: 1.2 to 2.0 times (red). The gate: 1.00 to 1.01 at every line,
also with a 22 ms long task every 150 ms. The cloud drops no refreshes, so how the
slot count reads a Mac that does is still owed to the Mac's `tools` shard.

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

**Shipped.** The loop hands the clock the kick's onset and the time it landed (the
reading's `at`, watched for a change, so no kick is lost between frames), and `npm
run learn` drives the clock that way at the shipped trust, 0.7. `npm run kicks`
measures it on the band's own score: locked after 8 kicks at 60, 30 and 20 fps (8
or 9 before, the heard kicks it did lock on being early ones), 170 of 256 kicks
fired ahead at 20 fps against 99, lead −8 ± 13 ms (−14 ± 20 before). The phase
pull was tried at 0.3 and did no better on this band (spread 18 ms against 13 at
20 fps), so `hear()` still snaps: with the onset's own time the snap's jitter is
the onset's, a few ms, not the smoothed level's 30–55.

### 15a. Only the Dropper lays the bottle's liquid (shipped)

Pour, Spray, Splat and Streak laid the colour and nothing else. With Ferrofluid in
the bottle, a Pour made a pool of near-black dye that the Magnet could not move.
With Oil, it made orange water that never became an oil body. Soap, milk, silicone
and glycerine were only colours. Every laying tool now lays the bottle
(`layBottle`), and a magnetic bottle lays its own dose of dye instead of a heavy
stain (`bottleDye`). The hands that are not the mouse (a replayed take, the pad,
OSC: `performGesture`) had the same gap in their own copy of the tools. Their
Dropper, Pour, Spray, Splat and Streak lay the bottle now too, and their Pour
spreads from where it lands, as the mouse's does. The show's own pour (Evolve, the
music, Seed, the looks' inject styles) still runs toward +y as it always has. Every
tool lays the liquid no wider than the bottle's Dropper (`bottleReach`), once a step
per hand. So a Pour of Oil is a held Dropper's worth of oil bodies, not a body a
fifth of the plate across every step. Checked by `npm run bottles` on the Mac (tools shard).
The app does not step on software WebGPU, so this check cannot run in a cloud
session.

Open: the Splat line's "following the hand" went red once on #203's Mac run (29
pours on the stroke, 0 at the mirror, the order wrong), on a path that change
does not reach (with no wall open nothing is gated). The line compares the
first quarter of the pours with the last along the stroke, and a Splat throws
its droplet up to 27 cells from the hand on a stroke 29 cells long. Modelled
with the hand's steps evenly spread, that comparison reads a working Splat as
not following on 0.07 % of strokes of 29 pours. So the likelier cause is steps
bunched by a stall on the runner, which leaves the two quarters near one point.
Judge each pour against where the hand was on that step (log the pointer with
the pour), not by the order of scattered droplets.

### 15c. Blow's wind erases colour rather than pushing it (shipped)

A moving Blow multiplied the dye under it by 0.8 every step, which cleared it, and
its push is the one-step push of 15b. So did a second finger's Blow on the phone, a
Blow on a plate that is not the lead, and every remote hand's (a directed blow
thinned 15% a step at its middle). Now a hand's Blow that is not the straw is the
wind (`blowWind`): it carries the colour the way the hand went, a take and a put as
the Finger's carry, with the ferrofluid's numbers (`blowCarry`), so the colour and
the ferrofluid go the same way. Held still (a puff that is not the straw) it blows
the colour out from under it onto the Press's ring. With Oil Bodies the oil goes
with its colour, along (`carryMix`) or onto the same ring (`pressOil`), cell for
cell. Measured in the lab (`npm run wind`, 30 readings of a Blow drawn a sixth of
the plate from a pool's middle): the old eraser kept 78.7% of the pool (a remote
hand's directed one the same) and moved its middle 1.05% of the plate backwards; the
wind keeps 100.0% and moves it 1.06% the wind's way (2.71% for a remote hand's wider
one). `npm run tools` on the Mac now draws a Blow across a pool through the real
pointer and asks that the stroke ran as the wind (the pointer's Blow counts its
straw and wind steps and what the wind carried, `blowSteps` in `chromaglassDebug`),
that the colour goes along and that it is kept.

A held puff lands the oil on the Press's ring, and the ring's kernel worked out what
each ring cell gets from the formula (1 / K), which a small palm's ring does not tile:
a puff six cells across lost 3.3% of the oil it moved on the Mac (`npm run wind` went
red on it). The kernel is now handed the share counted on its own grid, as the
colour's is counted on the mirror's (`pressShare`), and the Press's own oil, which
lost up to 1% of a press the same way, now keeps all of it (`npm run pressoil`:
32768.0 → 32768.0 in the middle, off it and in a corner).

The straw is now chosen by whether the hand has moved in the last 150 ms (the
clock the ferrofluid's wind already used), not by whether it moved this step. Asked
per step, a drag blew the straw on every step after a frame's first and on every
frame the pointer did not report a move, so a drag left a string of straw bubbles
and ran the wind a step a frame at best. The show's own puffs (a pour's burst, the
automation's breath, a bubble's pop) still clear the dye under them, as their look.

## Moved in the second pass (2026-10-04)

The shipped parts of the sections that were still whole in `PLAN.md`: sections 0, 5 and
9 to 25. Each heading here repeats the one in `PLAN.md`, where a stub says what shipped and
the open work stays. A section split in both passes has its heading twice in this file.

### 0. The dye a tool makes, and the deploys it is blocking

**Shipped in #152.** The Finger's "adds none" passes on Metal (208 → 199 against
−16 and −7 left alone), as do the Blow and the Press, and plates hold less dye at the
same point than before. What follows is how it was found.
*Found 2026-09-27, **fixed in #225 and #238** (2026-10-03/04; #238's first Mac run, with silence chosen, read 0.4, 0.4 and 3.7 past the drift against allowances of 10.7, 27.1 and 12.8):* **the mirror check's "and nowhere else" goes red at
exactly its limit on changes that cannot move a pixel.** It was the plate, not the
check. Six rounds of measurement on the Mac runner found the calm Classic plate
starting a single plate-wide flow out from the middle (0.63–0.88 of it radial, mean
speed up to 0.34) with the first bubble a drop trapped, and never with Bubbles at 0
(speed stayed near 0.005). Each bubble presses the glass over its footprint every
step, and the press source was balanced with a plate mean the CPU guessed from the
gap deltas over a resting gap of 0.03; a held press has squeezed its gap to the
floor (0.004), where the deltas are clamped away, so the guess was wrong and the
difference went into the pressure solve as a net source, which a closed plate has
no answer for. And on the app's glass the press's memory (`gapMemory`, a 0.22 s
half-life of remembered squeeze that does not move the gap) was summed into the
press's own rate every step it was held, so a held press pushed out some three
hundred times what its gap lost, and went on pushing from a gap already on the
floor. The projection's right-hand side is now made zero-mean exactly on the GPU
(`divTiles` in `wgsl/fluid.ts`): the glass lifting a hair everywhere to take what a
press pushed out. And the memory takes over only once a press has gone, never past
the floor (`squeezeUpdate`). `npm run heldpress` (lab, Classic's glass): a held
press's far plate once steady 3.28e-2 on main, as fast as while it closed, half of
it radial; 4.6e-5 after. It went red again after #225 (#218, #230, #237 and main's
997c71f deploy, all the same shape: drops 1 and 2 clean, then the middle moving by
itself). #238 found the bubbles were the simulated band's, started by the check's own
first drop, and that the air's standing source in `divergence` poured liquid out of
every still bubble with the whole plate as the sink (the item on a still bubble
below). It takes the term out and has the check choose silence and assert that no
band played. The original report follows.
 #191 (PLAN.md only) read
"Classic, calm, layer 1 turned a quarter: and nowhere else" at 11.1 past drift
against an allowance of 11.1, at the tool's mirror through the centre
(`scripts/mirror.mjs`, the Mac plate shard). It has been red at its limit on other
branches that do not touch the plate. Either the mirror echo it was written to catch
comes back now and then, or the allowance is drawn from a drift reading that is
sometimes as large as the echo; which of the two is the first thing to settle, from
the per-drop numbers it already prints. A thread cannot re-run a job (403), so each
of these costs the owner a by-hand re-run. *Later that day:* #208's plate shard read
13.4 past drift against 12.5 at row 3, column 5, not a mirror cell, where the drift
grew on every drop (3.5, 5.9, 11.2, 60.1): a region starting up by itself caught two of
the four drops (past drift 1.0, 3.1, 30.8, 23.7), and a median of four does not hold
two. So the second guess, the plate's own movement, not an echo; #225 traces that
movement to a held press (every trapped bubble) setting the whole plate flowing.
*Found 2026-10-04 (#238); **shipped #251 (0-bandbubbles)**:* **the simulated band's
kicks released bubbles whatever Audio Impact said.** The first click on a browser that
never chose a sound source starts the band (`App.tsx`, the first visit's wake), and
from then on a kick may release bubbles into the densest dye near the middle of the
plate (`LiquidVisualizer`, "A few bubbles at a time"). Audio Impact 0 and every
mapping set to none leave that on, which is how the drop check's calm plate came to
have bubbles at all; the check now chooses silence (`scripts/mirror.mjs`). Whether
Audio Impact 0 should mean the music touches nothing, bubbles included, is a look
question: gating them would change only plates set to 0.
**Shipped:** the owner asked for the fix (2026-10-04), taken as: Audio Impact 0 means the music drops
no bubbles; the first click still starts the band. A kick's odds of releasing air now
follow the dye ring's own scale, impact over its default (0.45), capped at the
default: unchanged at 0.45 and above (the same draws, so a render at the default is
the same render), thinning with the fader below it, none at 0. The phone's Sound Drive
is the same setting. `npm run kickbubbles` (Mac, open shard) plays it as a first visit
does, on the laptop and the phone at 0 (no release over at least 15 kicks that reached
the bubbles' decision) and at Classic's own 0.55 (drive 1, a share of kicks near the old
45%), with `chromaglassDebug().musicBubbles()` counting the frame's own chances,
releases, Audio Impact and Bubbles.
**The phone's take-button checks judge the fade by its own clock, and the slider by
its lag behind it** (this PR, `npm run phone`). #207's Checks run went red on "set to
one bar in the drawer, the same take lands in about half the time … with a jump", on a
PR that does not touch the Mixer, and a cloud session went red on it on 4 of 4 runs.
The check read the slider every 80 ms and judged each step against the time between
reads, but a slider shows what React last rendered: one render landing ~120 ms late
and the next catching up read as a jump. Now the app logs each level a take works out
(`window.__cgFadeLog`, kept only when a page asks), the fade's steps are held to the
time between them and to coming about a tick apart, and the slider is held to how late
it is behind the fade. 5 of 5 runs green (two on 2026-10-03's main); red on all three lines against a timer slowed
to 400 ms, a slider written one tick in 25, a level rounded to tenths and a clock a
quarter second ahead on one tick in ten.
The dye's advection now thins
where the flow spreads and thickens where it gathers (the Jacobian of the
backtrace, in `macCormack`), with a gathering cell held to the most its upstream
cells held. The Finger's own velocity was never the source — in the lab it moves
the plate's total by 0.0% — the fingering push added after the projection was
(taken out since, below): it ran along the dye's gradient, the Finger's carry made that gradient steep,
and the backtrace copied the dye outward (lab, the Finger's path under the
push: 636 → 756 against 687 left alone; now 622 → 588 against 612). Holding
the gathering side matters: carried conservatively, a push up the gradient is
diffusion run backwards and grew a speck from 1.0 to the 6.0 ceiling in under
five seconds.
**The fingering push grew a grating, and was what drained the plate** (2026-09-27,
`npm run grating` §5). Reported on Classic: stripes three to eight cells across at
every angle, and a quarter of an hour in, red dots in a lattice about ten cells
apart with labyrinths between them. Not #174's checkerboard (one cell, on the
grid's diagonals): a push in `forcesB`, set by a look's Polarity, moved the dye
along its own gradient by a slow noise, and where the noise was negative that is
diffusion run backwards, which grows a spinodal pattern inside every pool at the
size the push's gradient sees (a logical cell either side). In the lab, Classic's
own step on forty pools for ten seconds, 512 under 192, the worst channel's
share of variance in waves 2.6–16 texels across, in parts of 10,000: 52 as laid,
107 without the push, 2518 with it, and 819 at a quarter of its strength; the
plate kept 97% of its dye without the push and 41% with it. Tried on the same
plate before taking it out (a first look, alpha only, waves 2.6–8 texels, where
the push read 1895 against 32 without it): carried as a flux (conserves the dye, grows the pattern three times as fast:
4165), pushing only outward (345, and still losing dye), pushing along the
contours (3298), and only at a pool's edge (40 at ten seconds; at thirty, 109
against the stirring's 45, a comb of teeth along every edge and holes drawn into
pools). On a phone's grid (256, half-float dye) at Velvet Underground's strength
(Polarity 0.9, 0.22) the same push grows its waves a few cells long, where the
grid's axes pin them: the crosshatch the owner saw on the iPhone (2.6–5 texels,
231 against 22 without it; the picture is in the project's files, not the repo,
at `dye-grating/phone-grid-half-float.png`). None of
those is the phenomenon (below), so the push is **taken out**,
on the GPU and the CPU plate alike. The Finger's "adds none" reds were this loss:
the plate alone lost dye, so a stroke read as adding it; the
Finger's own lab read −0.2 idle out of 1329 with the push off (finger-lab, 2026-09-27).
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

### 5. Playing it: sound learn, shutter, and a look link

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

### 9. Ferrofluid after the references

**9a. The edge, and two looks, shipped in #161.** The ferrofluid ends on a sharp,
antialiased line at any zoom (edge width at 1x 17.9 → 1.5 px; at 3x 4.46 → 0.40
cells), with an amber sliver inside, a bright meniscus outside and a glint that stays
with the key light. A pool is black all through. Two looks: **Ferro Maze** and
**Ferro Paint**. `npm run ferrolook`, 10/10.

- **9c. The dye rides the ferrofluid** (**shipped**, #168). In Ferro Paint the dye is not carried by the
  ferrofluid, so the patchwork does not deform with the fingers the way the reference's
  does.

- **9e. The magnet stands it up** (**shipped**, #183). Reported: "doesn't make spikes or fingers.
  It's just a big blob that gets pulled around by the magnet." The magnet's pull held a
  gathered pool round, and a full pool is stable in the maze's physics, so nothing
  broke it. Now a magnet brought up close (the Magnet tool; no look's own magnet is
  near enough) stands the pool up into Rosensweig spikes: the solver draws the liquid
  into a ring-packed field of domes round the magnet (`src/gpu/wgsl/spikes.ts`, wells
  in `phaseMu`), under a maze field the dipoles' repulsion rises across its reach, so
  the pool's outline breaks up rather than rounding, and the plate draws each dome as a peak with a star
  of light and a white point on it. On the phone every finger holding the Magnet is a
  magnet (up to four). `npm run spikes` measures it; numbers in the PR.

- **9f. Colour between the domes** (**shipped**, this PR, `npm run domes`). Where the
  pool parted, the gaps showed a thin amber film, not the bright dye the references
  have between their domes. Two causes, measured on Magnet Garden at 384². The maze's
  flow destroyed the dye under the backtrace advect (6% of the plate's dye gone, the
  gaps left with 3% of theirs): now the dye crosses faces wherever the maze flows
  (bodyAdvect, conserved), a numerical loss removed, and the gaps draw in the dye's
  own colour. And the domes stand shoulder to shoulder (16% of the plate near the
  magnet under half full): that is 9t, the physics the model lacks. A pull eased
  while the hand is still opened the gaps to 41%, but it was a look-driven tuning
  and was dropped under the physics rule. The phone's finger magnets get the same.
  Judging notes: docs/judging.md §22.

- **9t, as found. Domes that stand up out of the layer** (found building 9f; built as
  the 9t below, **shipped**, with a film rather than the cap raised). The ferrofluid is
  a plan-view layer capped at full (phaseRelax, and the double well's minimum at 1),
  so a pool the magnet pulls together can only spread sideways, and the domes pack.
  A real Rosensweig peak rises many layer depths out of the pool and draws the
  liquid from the valleys into it, which is why the references show dry, coloured
  gaps. The fix is physical: let the column under a spike hold more than full, as
  high as the magnetic pressure against surface tension and gravity holds it, with
  the double well and the relax pass following that height; then SPIKE_PULL's 0.5,
  itself a tuning standing in for this, can go back toward the plain Kelvin force.
  A first try (the relax cap raised under the spikes alone) stood the domes at only
  1.4, because the double well still pins the layer at 1
  (/mnt/project-files/handoff/ferrofluid-9f/taller-domes-tried.patch). `npm run
  domes` should then ask for a third of the plate near the magnet open again.

- **9i. Fingers past the spikes** (**shipped**, #200). A pool bigger than the
  spikes' reach stayed a round blob past them under the Magnet: on Magnet Garden
  the push it gave went in through the separation's own diffusion and thinned the
  edge to a grey the plate does not draw. Now, on a look with a Labyrinth, the
  hand's magnet's field is at least as strong as its spikes and reaches further
  (screening 0.04 of the look's), the dipoles' push moves the liquid only by flow
  (`phaseMu` writes the flow's potential and the separation's apart), and the
  well steepens where the push is on so a finger stays liquid. A pool poured 0.17
  of the plate in radius, the Magnet held six seconds at 384², counted as black
  fingers crossing circles in the plate's picture: on Magnet Garden 12, 9 and 9
  on the circles 0.06, 0.09 and 0.12 past the poured edge, in 7 of 12 sectors; on
  main 6, 3 and 1, grey stubs. The phone's fingers holding the Magnet get the
  same, from the same solver. Looks with no Labyrinth (Classic) are as they were:
  giving the hand its push there too, with its pull eased so the edge could get
  out, stopped a close magnet gathering scattered drops (`npm run ferro` on the
  Mac), and with the pull whole the fingers came out grey (9o). `npm run
  fingers`; Mac look in `docs/judging.md` §16.

- **9n. Blow and Finger on the ferrofluid** (**shipped**, #206). Asked by the owner
  (2026-09-27): shouldn't blowing and Finger also move the ferrofluid round? They
  barely did: both only added velocity, which lasts one step before the speed
  clamp cuts it back (a stroke across a pool moved it 0.2 of a cell), so the dye
  has long been carried by hand and the ferrofluid never was. Now the Finger
  carries it along the stroke as it carries the dye, Blow held still blows a hole
  in a pool and moved pushes it along (`carryPhase`, conserving). A moving Blow
  keeps the way the hand last went for 150 ms, so a frame's later steps and a
  frame the pointer did not report a move in push rather than puff. Only a hand's
  Blow and Finger: the pour event's burst, a bubble's pop and the automation's
  breath and evolve stroke, which also blow or drag, leave it be. Every hand goes
  through the same methods, so a phone's fingers on Finger and Blow do it too
  (the pointer's path, the mouse's numbers), as does the remote
  (`performGesture`); a phone finger on the Magnet is still a magnet. `npm run
  ferrohands`.

- **9s. Picking the Magnet made a black hole in the middle** (**shipped**). Reported
  by the owner (2026-10-03): "Magnet makes an immediate big black hole in the middle
  when I select it." Picking the Magnet on a look without a magnet gave the look one
  (Magnet Strength 0.8, since #155), and a look's magnet sits under the plate at
  Magnet Across and Up, the middle, from the moment it has strength. So before the
  hand touched anything, a magnet nobody put there pulled the freshly poured ring of
  ferrofluid into one pool in the middle: in the lab (Classic's pour, 256²) the disc
  0.12 round the middle went from 9% of its area black to 54% in a second and all of
  it in four, holding a fifth of all the ferrofluid, against 9% black with no magnet. Picking a magnet up is
  taking it in the hand, so now picking it only pours the ferrofluid, and the look
  gets its magnet from the first hand that holds one (`onMagnetInHand`), set down
  where that hand lets go, as #159 left it (every hold gives a look with Magnet
  Strength 0 the 0.8 again). `npm run magnet` asks that the solver is stepped with
  no magnet until the hand holds it, that the disc's mean ferrofluid stays under 0.3
  nine seconds on (in the lab 0.10 as poured and after, 0.54 a second into the old
  magnet and 0.97 by four), measured again if the ferrofluid was laid afresh in the
  window, and that the magnet let go of has strength. Left: a hold while the show is stopped
  or draining gives no magnet, because the hand is read in the solver's step; a
  hold after Start does.

- **9y. The Magnet brings no ferrofluid** (**shipped**). Asked by the owner
  (2026-10-04), on the build with 9x live: "Why does the magnet add ferrofluid? It
  should only work on ferrofluid that is already there." 9x's first touch on a bare
  plate laid a pool under the hand (`magnetFor`) and the app turned Ferrofluid up to
  draw it; a new solver was given that pool again at the magnet. All three are gone,
  on every path (desk, phone fingers, MIDI and the remote all hold the magnet through
  `magnetFor`): a magnet is a field, and over a dish with none in it a real one moves
  nothing. The hold still gives the look its magnet (Magnet Strength 0.8, so it is
  set down where the hand lets go), and turns Ferrofluid up only when the solver has
  ferrofluid to draw (`phaseIsLive`: poured, then hidden by the amount at 0 or a look
  with none), since turned up over a bare plate the frame loop's "turned up on a bare
  plate" pour would lay the look's ring. Magnet Size is the magnet's own size and
  reach. Every look that shows ferrofluid (Magnet Garden, Ferro Maze, Ferro Paint)
  pours its own when it is laid; none relied on the Magnet's pool. `npm run magnet`
  now asks that a hold on a bare plate lays nothing (none in the solver, no look's
  pour, Ferrofluid still down) while giving the look its magnet; that a pool poured
  as the bottle pours it is drawn by the hold, not added to, and carried by the
  drag; and that a new grid lays nothing on a bare plate, picked and untouched or
  held. Found along the way: ferrofluid poured by hand is not what a new solver gets
  back; it gets the look's ring while Ferrofluid is up (9w, since shipped).

### 10. Playing like a show

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

   - The swells run at 3.2 a minute following the song, against 2.4 without;
     inside the footage's 1.6 to 3.7, near its top.

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

   - **Stroke centres are not checked to be whole cells anywhere. Done:** `squishDisc`
     and `applySquish` round every centre now, so the next fractional caller lands on
     the nearest cell instead of laying nothing (`npm run lift`).

### 11. The mixer

5. **The mixer on a narrow desk**, *shipped* (#196). At 1024 px the docked sheet
   covered half the plate. Done more simply than the compact layout planned here:
   the docked Mixer is the rides' column wide at every window (304 px, was 440), so
   it lies over the rides it stands in for and never over the plate; the row's name
   keeps its width, the tag gives way, and the blend buttons sit closer. Measured
   against the plate's own box: 29% of it covered at 1024, 18% at 1280 and 15% at
   1440 before, 0% at all three now. `npm run layout` opens it at the three widths
   with a row's drawer open and asks that none of the plate is under it, all five
   blend buttons are there, and nothing in it is cut, crowded or spills (27/27).
   The phone's Mix sheet is its own layout (step 1) and is unchanged.

Found while building step 1, both **done** (#198): the remote's Mixer had no check of
its own (`npm run phone` drives the phone layout, not `?remote=1`); `npm run remotemix`
now starts the show server with a display and a phone on the remote and asks the
display's own settings that the phone lists its rows in its order, moves the stack by
the stack's rule, sets a blend and a level, walks a take down over the fade time set on
the display and back, and takes another row with its own button (12 checks, in the
Measure job; the order asked is one set on the display, since a remote that never read
it drew the default and agreed). And on landscape phones narrower than about 800 px the dock's
tools fell under the 48 px target (42 px at 740×360, 35 at 667×375): there the dock is
now two rows, the ten tools over the five sheets, at 48 px and 4 px gaps, and one row
from 800 up. The second row cost the plate its height (48% of a 667×375 screen, under
the half a landscape plate is held to) until the top row, a full-width band of touch
between the look and the three buttons, let touches through to the plate: 60% there
now, and 79% at 844×390 (was 65%). `npm run phone` holds 800×360, 799×360, 740×360 and
667×375, asks which sizes get one row and that a finger in the top gap lands on the
plate (243 checks, was 177).

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

- `mirror.mjs`, "Classic, calm, layer 1: and nowhere else" (**fixed in #225 and #238**: the
  region starting to move by itself was the bubbles' press leaking a net source into
  the pressure solve, then the air's standing source, under bubbles the simulated band
  released after the check's first drop; see the mirror item near the top): on #189 (the Mixer's gel
  and lumia rows, whose default picture renders the same to the byte as main's), 16.3
  past its drift at the hand's left/right mirror cell against an allowance of 16.1.
  The cell's drift climbed drop by drop (3.2, 5.9, 18.3, 49.5) and its change with it
  (5.0, 10.0, 46.8, 78.4): a region starting to move by itself mid-run, the case the
  check's own comment says it gives up. Over the seven Mac runs before it the same
  line read 2.1 to 9.1 against allowances of 8.3 to 36.4, at most 63 % of it. Worth
  asking whether a drop's drift should be read on both sides of the drop, so that a
  region starting up is in the drift and not only in the change.

- `bottles.mjs`, "an Oil Pour lays the dye a Water Pour does per push": red once on
  #210 (9.05 against 10.22; #201: 9.17 against 9.29). Water's ratio moved, not
  Oil's: the mouse's stir is a push with no dye once a move event, the Pour's once a
  step, so the ratio read how many steps the runner fitted into each move. **Fixed
  in #210:** only the hand's own Pour counts (pushes made in the task that laid its
  dye, nothing through autoInject); the detail line prints what was left out.
- `bottles.mjs`, "splatter with the Ferrofluid bottle lays ferrofluid along the
  stroke": red once on #209 (docs only), "not following the hand", 26 pours. It read
  the pours' own places, and a Splat flings its liquid up to 27 cells from the hand
  on a 29-cell stroke. **Fixed:** it reads where the hand was at each pour, and asks
  that the pours land on it on average and that the hand moved along the stroke.

### 14b. With the wall up, the plate may draw twice a refresh and the governor cannot see it

*14b-2, the gate on a busy machine (shipped 2026-10-03).* `wall`'s floor went red on
starved Mac runners (#231: 36.4 drawn against 37.7; once 23.3 against 25.0) with the
draw gate untouched. Two things were wrong. The floor was 0.9 of what the show drew
alone at the start of the run, a different two seconds on a runner whose rate moves by
a third, so it judged the runner more than the gate. Judged against what either window
was handed in the same seconds, the 53 Mac runs of 2026-09-28 to 10-03 read 0.86 to
1.0, and the three under 0.9 were the gate: both clocks on one refresh, 24.3 drawn a
second where the show's own window was handed 28.3 (and 24.4 of 28.3; 34.8 where the wall's was handed 38.7). A
window handed only some refreshes has gaps of one, two or three, the gate's median of
them read two, its 0.6 of that 1.2 refreshes, and the show's next frame one refresh
after its own draw was turned down with nothing in its place: the wall costing the
show frames on exactly the machines least able to spare them. Now a clock's own next
refresh is never turned down (one turned down per clock per draw, which is all one
refresh holds), and the floor is 0.9 of the more of the two windows' frames handed in
the same seconds. `npm run wall` makes the busy machine on purpose (half the
refreshes missed by both windows together, checked to be the same ones; a cloud
browser misses none under load): the gate as it was drew 23.4 of 29.4 handed with both
clocks on one refresh and 26.0 of 29.5 half a refresh apart (both red), now 29.5 of
29.5 at each; in its
arithmetic on a 60 Hz display missing refreshes, 0.75 of either window alone at worst
before and 0.99 after, never more than one draw a slot. The regular-clock sweep is
unchanged (28 and 20 a second, 120/60, 11.7 ms draws).

### 14f. Sound and MIDI reach the plate a frame late, through a whole-app render

**Shipped, the sound's half (2026-09-27).** Measured first under `?debug` with the
simulated band: the App rendered 69.8–70.3 times a second against 60 readings, and
with no sound at all 5 times a second, every one of those a poll (the layer badges,
the tempo label, the song's shape, the timecode, and where a plate draws the engine
status) setting a value it already had, which React renders the App to find out
whenever anything else is pending. Now the ear keeps every reading in a ref the
moment it makes it (`Ear.live`), tells React ten times a second (`EAR_VIEW_MS`), and
hands every reading to listeners on its own clock (`Ear.onReading`), which the cast's
audio feed uses so it keeps its 30 a second behind the wall. The plate asks for the
reading at the top of each frame (`hear`), and its frame first offers the ear that
frame (`plateFrame`), so the frame hears a reading taken on itself whichever of the
two loops runs first. The polls compare against what they last set. `npm run
renders`, on the Perform desk: React told 10.0 times a second, the App rendering
11.0 (those and the desk's "live for" clock), every commit on the page the same,
laptop and phone; the old ear 69.9–70.6, red. The ear tells React on a 100 ms
schedule, not 100 ms after the last time: readings come on frames, and "the first
frame past 100 ms" fell to 7.5 a second at 15 frames a second (by the rule; a slow
Mac draws 24 to 42), where the schedule keeps 10.0 down to 10. A quiet page renders
its clock and nothing else, 1.0 a second (the old engine-status pattern 1.3–1.7,
red). A frozen view (0.0 told), a dead render counter and a dead commit counter are
red too. On the Mac `open` shard (#211's first run) the plate heard a reading taken
on its own frame on every frame it drew (95 of 95 and 126 of 126 laptop, 72 of 72
and 93 of 93 phone), with React told 9.9–10.3 a second at 24 to 42 frames a second
and the App rendering 10.9–11.6. The ear's reading for the plate's frame runs
guarded, so a throw in it costs that frame its reading, not the plate its loop.

### 14v. The show takes a long time to load on the web

- **Shipped:** the opening's pipelines are built three at a time (`?lanes=N` to time
  other counts, `?lanes=1` the old way); the built page asks for the app's chunks
  alongside the entry (`vite.config.ts`), but not for the remote or a cast; and
  `main.tsx` asks for the GPU before it imports the app (`gpu/device.ts`).
  `npm run loadtime` holds the order (Brotli, 100 ms round trips, 10 Mb/s): the
  app's chunks asked at 0.12 s, before the entry is in (was 0.30 s, after it); the
  GPU asked at 0.41 s (was 0.88 s); in a cloud session with `PW_WEBGPU=1`, the
  device given at 0.42 s (was 0.95 s) and the first shader handed over at 0.81 s
  (was 0.96 s). On the Mac (`npm run startup`, cold), two at a time built the
  fifty in 10.86 s against 11.46, 13.57 and 11.83 s one at a time: the
  forty-nine after the first (which waits on Chromium starting the GPU) a fifth
  faster, 7.17 s against 8.93 and 9.17 s, with no frame gap over 0.67 s; three at
  a time built them in 8.76 s, the plate stepping at 9.52 s (was 12.15, 17.62 and
  12.49 s), with no frame gap over 0.58 s (run 37174580232).
- `npm run loadtime` runs in Measure's browser part (`checks.yml`, "The load").
- **Shipped (the owner asked, 2026-10-04): the intro covers the black plate.** "Could
  we add a ChromaGlass intro for the first load? It could cover the latency of things
  loading in the background." The mark (its burst turning under the C), the name and
  "Warming the lamp" over three slow pools of the mark's dyes, drawn by `index.html`
  itself so it is in the page's first frame, before any of the app has arrived: a
  video would have been one more download in front of what it covers for. It moves
  by transform and opacity only, which the compositor runs while the page's thread
  is held at the GPU's start. Once the app is up the plate's frame takes it in
  (`lib/intro.ts`), so on the desk it fills the preview's hole and not the desk, and
  on the phone it sits under the dock; it starts its 0.9 s fade on the frame the
  plate first steps (the first drawn, if the show opens paused), never holding the
  plate back. A press on it or a key skips it, a press on the desk does not; the
  failure screen and the slow-download button take it away; the remote and a cast
  (the projector's window, the network display) never show it; it gives up after a
  minute. The brand's art draws its three layers (`npm run brand`,
  `public/intro-*.svg`). `npm run intro`, in Measure's browser part on SwiftShader:
  the intro in the first frame at 0.61 s with the app's chunk in at 1.78 s (100 ms
  round trips, 10 Mb/s); leaving on the very frame the plate first stepped (12.79 s
  on SwiftShader); covered 12.08 of the 12.08 s from the first paint to the first
  step; the page's first contentful paint is now the intro's, 0.70 s. `npm run
  startup` prints its times on the Mac ("the intro: …") for the cold opening.

- **Shipped, 14v-4: the intro held still while the opening's render pipelines
  compile.** The first deploy carrying the intro (run 37233245217) went red on
  `npm run startup`'s "no stop in the opening": no animation frame for 2.82 s from
  3.15 s with the page neither busy nor held, exactly while `plate/display` compiled
  (4.30 s from 2.71 s), and again for about 1.9 s while `plate/derive` did; through
  the compute kernels after them the frames ran on. Before the intro the display's
  compile stopped nothing (no gap over 0.62 s on #254's run, display 3.46 s): a page
  with nothing new to draw needs nothing of the GPU process, a turning burst needs it
  every frame, and on the Mac such a frame waits there behind a render pipeline's
  compile (inferred from the timings; a compute kernel's compile does not hold it).
  So `prepareShow` pauses the intro's animations (`.cg-still`, `introStill`) two
  frames before the first of the opening's render pipelines is asked for and lets it
  turn again when the last has settled (`Quiet` in `gpu/prepare.ts`). `npm run intro`
  line 9 holds every frame against the opening's render compiles, read from outside
  the app: 242 frames up during them, none moving, held 2.02–6.18 s on SwiftShader,
  then turning on all 354 frames after; with the hold taken out, 178 of 178 moving
  and the line red. Its first version held still as each lane took its first render pipeline, which let three lanes ask for three at once (PR #283's first Mac run: a 2.15 s frame gap with `air/air splat` compiling 3.32 s); it now holds still before the lanes start, and line 9 also holds the opening to one render compile at a time (2 of 4 asked while another compiled with the first version). The Mac's `npm run startup` is what says the stop has gone; its intro line prints the stretches held still. This
  answers the open question of whether the swirl freezes: around the display's and
  the derive's compiles it does, and now it does so on purpose, still and not stalled.
- **Shipped:** the opening asks for its render pipelines first, the display first of
  all (`gpu/prepare.ts`): with three in flight it had been asked forty-fifth, and the
  last 1.34 s of the opening was the display compiling alone with the other lanes dry
  (run 37174580232, "slowest ahead"). And two solver kernels that did what another
  did are gone: `pressureClear` was `mgZero` with its count read off the Sim, and
  `mgProlong0` was `mgProlong` but for level 0's packed index (now `A.a.y`): one fewer
  compile in every opening on a thin gap (every look, since 18a-every), two in one
  opening with Thin Gap off. Each build ahead now records its compile and its first
  use apart (`Prepared.raw`), and `npm run startup` prints them ("each build ahead
  from its own ask"), to say whether the next cut is fewer kernels or waiting once for
  all the first uses rather than one at a time. Its first Mac run (37190509856, with
  #248's thin gap now in every opening) answered: built ahead 0.54 → 11.24 s, first
  step 11.54 s, and 6.31 s of the lanes' time was first uses, 6.18 s of it the
  display's, the derive's and the air's first draws, 2.06 s each and all at once,
  every lane idle while the GPU warmed. So a first use is now handed to the GPU and
  not waited for in its lane; the opening waits once for all of them at the end
  (`useWait`, printed by `startup`). On the next Mac run (37192204661): first uses
  1.17 s of lane time (was 6.31), the one wait at the end 0.00 s, built ahead 0.49 →
  10.16 s and first step 10.69 s (was 11.54 s on this PR's first run, the same
  opening), no frame gap over 0.62 s. The lanes now spend 27.4 of their 29 s
  compiling, so what is left is the compiles themselves: 48 of them, the first three
  under Chromium's 2.9 s GPU start.

### 14x. The microphone hears the hand on the laptop (shipped)

**Reported by the owner 2026-10-04:** pressing some controls (the Speed ride) or
picking a tool sometimes made the plate pulse, as if it took a beat or a press. The
show was on the laptop's microphone, which is opened raw (no noise suppression, for the
music's sake), a few centimetres from the trackpad. A click is a sharp knock with a
thump in the case, and the ear's kick onset is built to call exactly that; the plate's
kick (the squeeze, the centre pulse, the ring, the rock) follows it. Not the band's
drift at Audio Impact 0, and not a press: nothing reached the plate but the kick.

*Shipped:* `src/lib/handSounds.ts` marks every press, release, key and finger landing
on the page, and on the microphone alone a reading taken in the 250 ms after a gesture calls no
onset (`AudioFeatures.update`'s `hand`). The levels still move,
and a locked beat clock fires its predicted beats through the moment. `npm run clicks`:
in arithmetic, a quiet room's clicks were 46 of 46 kicks and are none; with the band
playing, the beat clock fired 303 kicks for the band's 258 and fires 257; in the app,
on the Perform desk 10 kicks for 10 presses and none, on the phone 9 for 9 taps and
none, while knocks with no hand on anything are still all heard.

### 15i. Picking a bottle pours nothing (shipped)

**Shipped.** The owner, 2026-10-04: "when I pick the ferrofluid liquid - it deposits a
huge chunk on the canvas. It shouldn't do that. I want to pour it on myself. Same with
all of the other liquids."

- **Cause.** Picking the Ferrofluid bottle turned Ferrofluid (`phaseAmount`) up to 0.6 so
  the drops would show (the plate draws the second phase only with it up). Only the
  frame's "turned up on a bare plate" pour knew that rise was for the bottle. Everything
  else that lays a look's ferrofluid read it as the look asking for some and poured the
  look's ring (a fifth of the plate in black drops round the middle): a new solver under
  the lead plate (the governor moving the grid, a lost device), every look cued after
  the pick (`layPlate` ran a render before the new look's settings arrived, by the 0.6
  still in them, and the pick's effect set 0.6 again on every look), and a cast display
  on a plate of its own, which gets the settings but not the bottle.
- **Fix.** Picking any bottle sets the bottle in the hand and nothing else, on every path
  that picks one: the desk's shelf, the Design desk's bottles, the phone's Dye sheet, the
  remote's `liquid` message, the Liquid Designer. MIDI and the set list pick no bottle.
  Ferrofluid is turned up when a hand has poured from the bottle and the ferrofluid is in
  the solver (`onFerrofluidPoured`, asked from the frame as the Magnet's hold asks), so it
  never rises over a bare plate. A look is laid by the Ferrofluid (and Scale) it asks for,
  passed with the cue, a Go and a Back, not by the settings the last look left or the
  half-way blend of a fade. A new solver lays the look's ferrofluid again only over the
  look's own, not over a hand's pour. And a pour that starts while Ferrofluid is at 0
  first clears what is in the solver unseen (a cut to a look with none leaves the last
  look's ring there), or turning the amount up for one drop brought the whole ring back.
- **What the other bottles did.** In the code, picking Oil, Soap or a dye changed nothing
  on the plate before this either; what landed with them was the ferrofluid ring, laid
  by a regrid or a look change while the amount the Ferrofluid pick had set was still up.
- **Measured** by `npm run bottles` (Mac): every bottle on the bench picked on an
  untouched plate lays no ferrofluid, no oil and no look's ring, and leaves Ferrofluid at
  0; a look cued with the Ferrofluid bottle in the hand lays none; Magnet Garden, which
  has its own, still lays it; the hand's first pour, over Magnet Garden's ring left unseen
  by a cut to Classic, turns Ferrofluid up and reads back as only the stroke's ferrofluid.
- **No look relied on the pick.** The three looks with ferrofluid (Magnet Garden, Ferro

### 15b. A tool's push lasts one step (why Blow and Finger barely move anything)

What was found when it was picked up: the clamp this item was written about is
already gone on a thin gap (`decayVel` neither damps nor clamps there, since 18a),
and Thin Gap is on in every look since #248. The push still moved nothing. Lab,
Classic's plate (384² under 192), the Finger's own velocity drawn 0.4 of the plate at
two cells a step through bands of colour, a pool of ferrofluid and a drop of oil on
its path: the bands moved 0.13% of the plate, as they do left alone, the pool 0.04%,
the drop 0.03%. A disc of velocity laid over still liquid is mostly the divergent
part of a flow, and the thin solve, which makes the flow conserve liquid, took it
straight back out. Only the hand-written carries moved anything.

What shipped: the Finger is a solid in the layer, moving at the hand's own speed
(Brinkman's penalised solid, inside the thin solve: `hsPrep`, `lib/handSolid.ts`). The
liquid it touches moves with it and the liquid round it gives way as the flow past a
moving disc in a Hele-Shaw cell does (a dipole, back the other way beside it at
U·a²/d²), and the flow carries the colour, the oil and the ferrofluid alike. On a thin
gap the Finger's carries (`carryDye`, `carryMix`, `fingerCarry`) and its push and swirl
no longer run; `liquid.stir` still mixes the chemistry under it. The ferrofluid's
carry, and the colour's under a Labyrinth's flow, take as many substeps as the fastest
hand needs. The show's own Finger stroke (the automation's) keeps its colour carry on a
plate with ferrofluid on it, as it did, so it does not pull tongues out of the pools. The numbers are in the PR and
in `scripts/fingerflow.mjs`.

Found by the Mac's `npm run tools` on the way: its Finger, drawn through a pool the Drop
had laid, took the plate's colour from 222 to 161 where the plate left alone gained 17.
The colour's and the oil's carries crossed faces rebuilt from the cells' velocities,
with the pressure put back as if the drag were even (18a-8), and a solid is exactly
where it is not: at the hand's rim those faces gathered liquid, a full pool's cells
went past the plate's cap of 6, and the cap cut them. Bands at 1 never reached the cap,
so the lab's first checks passed. The colour's and the oil's carries and the substeps'
Courant number now cross the faces the thin solve made conserve liquid, as the
ferrofluid's has since 15d (`THIN_FACE`, `wgsl/fluid.ts`): a full pool drawn as the
pointer draws one (a cell every third step) kept 59.5% of its colour before and all of
it after (`npm run fingerflow`, check 7).

### 15c. Blow's wind erases colour rather than pushing it (shipped)

**Fixed after it shipped (2026-10-04): a drag began with a straw.** Main's deploy
after #230 went red on `tools`' "keeps it rather than erasing it": a Blow drawn
across a pool of 229 left 175, with 5 straw steps among its 49 wind steps. A press
has no move before it, so "no move in 150 ms" made every step between the press
and the first reported move a straw step, and the straw's bubble takes the dye
under it off the plate while it sits there (`airExclude`; the plate's budget
servo returns it later). At the Mac runner's 10–30 frames a second that was 2 to
7 straw steps a stroke, and on a slow frame rate a moving hand whose moves came a
frame apart read as held too. The press now counts as a move, and the straw needs
the hand held both 150 ms and three frames with no move (`BLOW_STRAW_FRAMES`).
`tools` asks that the stroke blows no straw before its first move
(`blowSteps.strawFirst`), and prints the stroke's straw steps under "keeps it".

### 15d. Press moves the colour out of an oil body but leaves the oil, and leaves the ferrofluid

**The ferrofluid: shipped under Thin Gap.** A press greyed it. The flow carried the
ferrofluid by area (the flux form in `phaseAdvect`), so under a palm the glass's
outflow took a share of every cell, and a pool stayed the size it was and went grey:
its fullest cell fell from 0.96 to 0.48 with Thin Gap on and to 0.67 without (lab, a
palm pressing the gap to a sixth, ten steps in). A real pool between two glasses keeps its volume:
pressed, it gets thinner and wider and stays full. A flat take out to the palm's rim,
as the oil's (`pressMix`), would have been the same fault by hand: it takes a share of
every cell too. So with Thin Gap on, the ferrofluid moves as a volume, c·h, on the
thin solve's own face fluxes, and each cell divides by its gap after (`phaseAdvect`,
`phaseGapSeen`). `npm run ferropress` (lab, 7 checks): pressed over twenty steps to a
sixth of the gap, the middle of a pool held to 0.6% (0.955 → 0.961, the check allows
3%; it is a stagnation point), where carried by area the same middle fell to 0.155 at
twenty steps; its volume kept to 0.13% while the cells
it fills grew 2.5 times; and after the lift it matches a pool the glass never touched
to 0.006 in every ring. Two cuts on the way: putting the glass's
part back as c times the gap's change along the path kept a pool full but grew it 7%
a press and lift; carrying the volume on the cells' filtered velocities emptied the middle to
0.53, because that flux carried 18% more out of it than the glass displaced. Only the
solve's own face flux (the mean of two cells' h·u plus the second difference of
M_f·ΔP) keeps both.

## 16. Many plates: each projector its own source (rig-plan R1)

- **16a · The back plate gets its own look. Shipped (#231).** A look can be sent to the
  back plate alone: To Back Plate under Go on the desk, a Whole plate / Back plate
  switch at the top of the phone's looks sheet (it goes back to Whole plate once a look
  is sent), and two MIDI actions (Go to Back Plate, Back Plate Follows Front). The
  back plate's solver steps with the look's own settings (every `PER_LAYER` key,
  folded in as plate 1's base in `PatchBay.fold`, so the look's patches still ride
  it), faded like a Go (`lib/backLook.ts`). It pours the look's dyes, styles and
  liquids at every automatic pour and a hand's, and a handover lays the look on it.
  How the plates are drawn and lit stays the front's. A Go or a cut on the front
  leaves a back plate with its own look alone; Follow the front fades it back, keeping
  the plate on the stage until it lands. The Mixer's Back Plate row names the look,
  and the layer pickers offer the back plate while it has one. Check: `npm run
  backplate` (33, in Measure; red under sixteen mutations) and a phone check (the
  switch, the names, the front untouched). The lab with two solvers moves to 16d,
  where the lab has to hold N of them; the Mac judges the pair (`docs/judging.md`).

- **16b · A projector picks its source. Shipped (#226).** A mapped surface (Settings,
  Mapping; on the phone More, Settings, Mapping, the picker a thumb's size) shows the
  whole wall (today's frame, and the default, so every saved rig looks as it did), the
  front plate alone, the back plate alone or the film alone. Each source a surface
  asks for is the plate's display pass drawn again into its own texture with its own
  uniforms (`WebGPUPlate.drawSource`): the frame's settings with the Mixer's other rows
  at 0 (`lib/plateSources.ts`), so a source is graded, blended and dimmed as its row is
  on the wall, and a blackout or the flash guard reaches every projector. The logo goes
  out on the front plate's projector only, so two projectors do not carry two. Only the
  full-screen display is repeated; the solvers, the pack and the derive are the wall's.
  Nothing is drawn for a source no enabled surface shows. Two things found in review and
  fixed with it: the film was tinted and bent by the front plate's dye at full strength
  whatever the front plate's level, which printed the liquid into the film-alone
  projector (171 at worst on the lab plate; now by the front plate's level, so a faded
  front plate also stops tinting the film on the wall), and a film row on Multiply was
  a black film projector (it multiplies what is under it, and under the film alone is
  black; there it is drawn Add, the frame itself). Checks: `npm run map` (42: the
  routing from each slot's number through the shader's branch and binding to the
  texture bound there, the rows each source leaves out against a base where every
  setting has its own value, Multiply on the film), `npm run mixer` section 8 (8: each
  source exactly the wall with the other rows at 0, drawn in the wall's frame, and the
  wall untouched; the film alone the same with and without dye; red when a source reads
  the wall's uniforms and on the old film tint), a phone check (the picker from the
  phone, and the show's config holding the pick), and `wall` on the Mac (on Classic, two
  projectors side by side: each source against the wall with its other rows at 0 in the
  same frame, and each source's pass timed).

  - *Found on this PR's first Mac run:* `wall` §7c was measuring a moment of the plate.
    On Classic the back plate is laid empty (`layPlate` seeds only the front), so the
    back source and its reference were both black and the front source was the wall to
    0.001; and with no film loaded the film alone was black. It now runs on Fillmore
    East (its back plate laid with its own wash) with the browser's fake camera as the
    film, and asks that a film is playing before it measures. The same run's "every
    refresh's own timestamp was believed" is the Mac stamping refreshes up to 2.4 ms
    ahead; the draw gate's fix from #218 is ported here (it no-ops once #218 lands).

- **16c · Beams add, and the seam goes. Shipped (#232).** A mapped surface's Light is
  Over (laid over what is under it by its opacity, as every surface was, and the
  default, so a stored rig looks as it did) or Add, a beam (Settings, Mapping; on the
  phone More, Settings, Mapping). Two beams crossing add whole: the overlap a light
  show was played on. Where they are one picture carried by two projectors (the same
  source, showing the same point of it there, tiles lined up with an overlap) they are
  edge-blended: across the overlap each gives the share of how far inside it the point
  is, so the two sum to the picture whatever the overlap's width, with no bright seam
  and no dark one, and a feather shapes only the edges no other tile covers. One
  pipeline, premultiplied colour with the colour clamped first, so over is the old
  pass byte for byte at every gain, and the quads stay one draw. Check: `npm run
  beams` (8, the projector's pass on software WebGPU with pictures made to order:
  over byte for byte against a second lab built with the old pass at gains 1 to 3;
  two sources summed; tiles sharing by depth, read with one at half so the shares
  show, across and stacked, against a plain crossfade and against one laid over;
  crossing beams of one picture summed; all four feathered edges; a beam over a
  lit surface and at gain 2; red on six broken shaders: no clamp, no flip, depth
  blind to height, no shares, shares for any point, the alpha factor), `map` (44:
  the stored default, the blend in its slot, a stale slot cleared), and the phone
  check (Over before, Add after, in the button and the show's config). The pass
  itself needs no Mac: it reads its pictures, not the plate.

- **16f · Add and take off the back plate on every look. Shipped (#273).** The owner
  asked (2026-10-04) why layers could be added on some presets and not others, and
  taken off on none. The Design desk showed its plus only on a one-layer look and had
  no minus, so the twenty-odd looks carrying two offered nothing, and the phone's plate
  picker showed only on a two-plate look with no button either way; only Settings ›
  Plates & LED's Layers slider reached every look. Now the desk has a plus on one layer
  and a minus on two, in the same place, and the phone's Play sheet always has its
  plates row (Add a back plate, or Front / Back with Take off back). Neither takes the
  back plate off while it has a look of its own (§16a keeps it on the stage). Below
  1280 px the desk's layer tabs drop the word "Layer" and the fill bar: at 1024 the
  plate's column is 408 px and the header came to 480, which put the minus under the
  Recipe. Checks: `layout` (the desk takes Classic's second layer off and puts it back;
  red on the old desk) and `phone` (the Play sheet on Lumia and on Classic, with the
  engine's solver count; red on the old sheet). A third plate is 16d.

### 18a. The plate is a Hele-Shaw cell (replaces the speed clamp)

- **Shipped, first part (Thin Gap, off in every look, 2026-09-28):** the setting
  `thinGap` (a switch) and `gapThickness` (water to glycerine, log in viscosity) on the
  sheet, the desks, MIDI and the remote. With it on: implicit gap drag 12ν/h² in place
  of the clamp (a 0.2 m plate, the rest gap 6 mm); the step's forces and the lasting
  current read as terminal speeds at the rest gap and fed in before the solve, the
  stirring included; a variable-coefficient multigrid with M = h·c (h³/12μ once the
  drag dominates) and face coefficients built in series along each coarse row; the rim
  held at p = 0; the press as the gap's own change, not the squeeze memory's rate; no
  self-advection, second projection, squeeze sweeps or `squeezeVelBuf`; a hand's push
  imposed along its direction rather than added; the dye moved across faces as an
  amount (`bodyAdvect`), since a backtrace made dye under a press (332 → 656). The thin
  solve keeps its pressure in its own buffer and hands the advections c·P for their
  Rhie–Chow faces. `npm run thingap` measures it against the old solver (16 checks).
  Judged on the Mac: docs/judging.md §19.
- **Shipped, the Press draws the liquid back (Thin Gap, 2026-10-03).** The owner: the
  Press "just pushes everything out instead of bringing it back when you release".
  Thin Gap's flow is reversible, but the app's Press was not: measured in the lab
  with the app's own strokes (Classic's clock), the press closed the film to its
  floor in a step or two and the liquid it squeezed out crossed up to 75 cells of a
  384² solver in a step, where the dye's face flux may carry 0.45. The colour was
  left behind: the ring went 42% of the way out (192²), and the slow lift then drew
  it 0.06 of the plate inside where it began. Five changes, each on a thin gap only
  (off, every look presses as it did):
  - **The glass closes as a film under a load** (`squeezeUpdate`): the liquid
    leaves through the gap it is closing, whose resistance goes as 1/h³ (Reynolds;
    Stefan's law), so the hand's press is its rate at the rest gap and slows as
    h³, integrated exactly over the step. The fastest face fell from 75 cells a
    step to 8. This is the physical half of 18a-5.
  - **The carries in substeps** (`carryCourant`, `carryPlan`): the step's largest
    face Courant number is found on the GPU and the dye, the oil's share of it and
    the oil (`bodyAdvect`, `mixAdvect`) are carried in as many substeps as keep each
    under 0.4 of a cell, up to 33, the pairs dispatched indirectly so nothing is
    read back (21 at most for the Press at 1×). The numerical half of 18a-5.
  - **The press is a bowl** (`squishDisc`, `thin`): a clamped plate under an even
    load deflects as (1 − r²/R²)², laid with the flat disc's volume. The stacked
    flat discs were steps in the gap, which the collocated grid carries colour
    across badly. A kick's release gives its gap back in the same shape.
  - **The glass lifts in seconds** (`glassSpring`): Press Lift's half-life was
    counted on the look's step (Speed × 0.2), about 14 s on Classic; on a thin gap
    it is the show's seconds, 1.55 s at the default.
  - **The Press's carries retired on a thin gap** (`squeezeOut`: `pressDye`,
    `pressOil`/`pressMix`), and the strokes lay only the glass there: no cleared
    centre or piled rim on a press, no inward push along a lift's spokes (the spokes
    remain as where the glass opens first). The Press part of 18a-3.
  - Measured (`npm run presslift`, new, lab, plate shard; 384² under 192, software):
    the ring lands at 100% of the displaced volume's shift (0.3427 against 0.3425),
    every colour kept to 0.00%, the colour under the palm's middle leaves with its
    liquid (×0.171 against the gap's ×0.227), 34% of the shift back after 1 s
    (4% with the glass on the look's clock), and once the glass is back the ring is
    3% of its shift from where it began. `npm run tools` on the Mac now presses and
    lets go through the real pointer with Thin Gap on, against an idle pool.
  - `npm run thingap`'s Darcy disc is now held for twenty steps, as a hand holds a
    Press: closing as h³, one step's dent leaves the film at about 0.008, not the
    floor its λ is counted at (16/16 after: oil 0.0449 against 0.0368, water
    0.1951 against 0.1854).
  - The phone has Thin Gap and Press Lift on the Press's own Amount, beside
    Fingering.
  - With the Press × ferrofluid PR (#229) merged in: `npm run ferropress` presses its
    pool to a sixth of the gap in twenty steps at the rate the h³ closing needs
    (its straight steps reached only 0.61 of rest). Pressed that fast, the
    ferrofluid's volume grew 1.9%: its grid filter and Cahn–Hilliard kept Σc, not
    Σc·h. Under the volume form they now move volume (`phaseGrid`,
    `phaseCHVolume`): kept exactly, 0.01570 → 0.01570, 7/7.

  - **Thin Gap in every look: shipped (#248).** The owner picked every look
    (2026-10-03, over "off until tried" and "Classic only"), knowing every look would
    move the thin-gap way before anyone saw it at 60 fps; the owner's complaint it
    answers (2026-10-04): letting go of a press "ends up wiping all the liquids down
    the drain". It overrides the operating rule that a new default keeps today's look
    for this one setting; it is not a new rule. What it changed:
    - `thinGap` defaults to 1 (`src/types.ts`); no preset sets it.
    - Saved looks: a look saves every setting, so one saved while Thin Gap was off
      by default said 0 without anyone choosing it. A saved look is now version 2;
      one from before reads with Thin Gap on, one saved since keeps what it says,
      off included (`PRESET_VERSION` in `src/lib/userPresets.ts`; `npm run setlist`).
    - The opening: every look's first step is now a thin one, so the thin gap's
      fifteen pipelines (the kernels, the velocity's snapshot, the dye's carry in
      substeps; the mix's carry only where the look opens with the mix) are waited
      for before the show opens (`WebGPUFluid.prepare`, `Opening.thinGap`), and the
      first step finds them built and runs thin at once (`thinGapOn`), where before
      it ran the old way until an await said they were in. The ferrofluid's volume
      forms (`phaseGrid`, `phaseCHVolume`) wait in the ferrofluid looks for the same
      reason. `?prepare=0`, `npm run startup`'s control, builds them on the frame
      like everything else, so the check prices the same compiles on both sides.
    - The phone: nothing new to build. Its Press Amount sheet already has Thin Gap
      and Press Lift (#228), and it now reads On.
    - To judge on the Mac: docs/judging.md §30, now every look.
    - And the other way, the old plate's own pipelines (its projections, the
      velocity's self-advection, the squeeze's own solve, the dye's backtrace:
      fourteen, which a thin step never asks for) are waited for only where a look
      opens with Thin Gap off; a show that opened thin builds them when Thin Gap is
      first turned off (`prepareOldPlate`) and stays thin until they are in. Every
      opening otherwise built both solvers, about 3.4 s of a cold Mac's opening for
      nothing, which `npm run startup`'s 1b would have counted as the show's own wait.
    - Checks that measured the old plate's Press by default: `bottles`' Press-moves-
      the-oil lines (`squeezeOut` and `pressMix`, which a thin gap retires) now turn
      Thin Gap off for themselves and say so in a line of their own; `tools`' "Press
      pushes the dye out from under the palm" (a ring from 0.05 to 0.25, squeezeOut's
      move) runs on the old plate too, since on a thin gap the colour spreads as the
      film thins, r ∝ h^-½ (Mac: a pool 0.011 from the palm's middle went to 0.028
      at a sixth of the gap, √6 × 0.011 = 0.027), still inside that line's disc; the
      let-go check asks the thin gap in its own terms. `depth` asks Depth Drag on the
      old plate, the only plate it acts on, and asks the thin gap whether its rim is
      slower on a domed plate than a flat one with no dial. `press.mjs` (not in CI)
      opens on the old plate. Set lists bring old saved looks in with Thin Gap on too.

  - **18a-2, forces that are forces: shipped (2026-10-04).** Every force of a thin
    step was one step's velocity read as the speed it drives *this* liquid to at the
    rest gap, so the force itself scaled with the liquid's viscosity: the same pull
    moved glycerine as fast as the default oil, the magnet pulled the ferrofluid 7.9
    times harder through a liquid 7.9 times thicker, Rain Drip slid the whole plate
    downhill out of the dish (lab: the plate's mean flow 110% of a falling pool's),
    and Glass Smear and Updraft pushed only where there was colour. Now, on a thin
    gap only (the old plate steps as it did, to the bit), each is the force its
    phenomenon makes (`hsBody`, `hsPrep` in wgsl/thinGap.ts):
    - **Body forces** (the magnet, the maze, the oil's surface tension, Marangoni,
      Dye Weight, and the two below) are read against the *default* liquid's drag
      (`NU_REF`), so on the default Thickness every look moves as it did and on any
      other the liquid answers as h²/12μ says. The step keeps the velocity after
      them (`hsMid`, only when one ran) so hsPrep can tell them from the stirring.
    - **Rain Drip is heavy colour on a plate stood up**: the dye's excess weight over
      the plate's mean, down the plate's downhill (Tilt Direction; it was always −y),
      Boussinesq. A Hele-Shaw cell with a heavy liquid over a light one is
      Rayleigh–Taylor unstable, so the colour falls in fingers and the clear liquid
      rises past it, with no streaks drawn and no second friction. Its weight is set
      so a pool falls as fast as before (0.079 against 0.083, lab).
    - **Updraft is a draught's shear**: depth-mean τh/2μ (15g's model), on all the
      liquid, halved so a pool drifts as fast as it did (`AIR_SHEAR`).
    - **Glass Smear is the glass sliding**: ρ∂u/∂t = −∇p + f − (12μ/h²)(u − U/2),
      the liquid at half the glass's speed in any liquid and any gap, the glass at
      half of smearX so a pool moves as fast as it did. Uniform; a domed or pressed
      gap turns it through the pressure.
    - **The look's stirring stays a dial** (Turbulence and the music's swirl, the
      hand stir; Polarity's hold between colours; vorticity confinement; Vibration
      for now; the lasting current, 18a-4): still this liquid's speed at the rest gap.
      Named in "Kept, named as dials".
    - Measured: `npm run forces` (lab, plate shard, 10 checks): Rain Drip's pool falls
      7.66 times slower in a liquid 7.94 times thicker (the hand stir 0.97); a
      ferrofluid as thick as its liquid 7.73 times slower under the magnet (the old
      reading 1); the plate's mean under Rain Drip 0.0015 against the pool's 0.078,
      an evenly coloured plate still; Glass Smear 0.00239, 0.00246, 0.00246 against
      0.0025 open, thick and pressed to 0.71 of rest; Updraft 0.738 of the open
      plate's speed where the gap is 0.707, and 7.71 times slower in the thick liquid.
    - The phone: nothing new to build. No setting was added; the phone's Settings
      tile opens the same panel, where Rain Drip, Glass Smear, Updraft and Thickness
      are, and its solver is the same.

### 18b. The lamp shines through the dye (replaces paint over black)

- **Where:** `plate.ts`, where `bgColor` is black unless the blend is multiply, and the
  dye is composited with `mix(outColor, fluid0.rgb, fluid0.a)`. `decodeFluid` makes
  the opacity from the total density with a darkness fudge (×1.7 for dark dyes),
  capped at 0.95, and clamps the path through the gap to 0.35–4. The shader's own
  comment says it: "On this plate dye is light (bare water is dark)."
- **The shortcut:** the solver already stores the dye the physical way, as
  per-channel absorbance, so dyes mix subtractively in the solver. The picture then
  draws that as paint on a black ground. Clear water shows black. A gel, LED ring or
  lumia under the glass (`mixLamp`) does not pass through the dye, so blue dye over a
  red gel shows blue where it should be nearly black. A drop's glow adds the dye as
  emitted light.
- **The real phenomenon:** Beer–Lambert transmission of the lamp,
  out = L_lamp(x) · exp(−Σ εᵢCᵢh(x)). Clear liquid shows the lamp at full brightness,
  and dense dye goes saturated and then dark.
- **What it takes:** nothing new from the solver. The absorbances and the gap are
  already bound to the plate pass. Replace the mix with `lamp * exp(-A * h)`, keep
  `spectralThrough`'s six bands, and drop the clamp and the fudge. The chemistry's
  colours (the BZ waves, Liesegang rings, the pH indicator) are lerped paint today
  (`mix(outColor, col, 0.85)`); each becomes an absorbance added before the exp, so a
  BZ front becomes a pale blue wave through orange liquid with the dye still showing.
- **Cost:** free.
- **Gain:** the largest honest change available in the picture.
- **Caveat:** it inverts every approved look, which today are colour on black. It ships
  as a per-look choice of ground (black or lamp). The dark ground can then be made the
  physical way, with a dense base dye in the dish or the lamp dimmed, so a look can keep
  its darkness for a real reason. Relates to physics-plan "Layer depth" and bubbles-plan
  F (the wet carrier).
- **Shipped (#256, 2026-10-04): Lamp Ground** (`lampGround`, Settings → Lamp & Light;
  MIDI, the desks, the remote, the phone's Looks sheet), 0 in every look, so nothing
  changed until the owner turns a look up (judging §31). At 1 the ground under the
  dish is the lamp (through whatever the mixer has under the glass: the LED ring, the
  gel, the lumia), and the dye is a filter on it: `ground · exp(−a · amount)`, with
  `spectralThrough`'s six bands where Spectral Optics is up. The amount is the one the
  opacity was always made from, without the ×1.7 darkness fudge and the 0.95 cap, so
  the same pool is the same depth of dye on either ground. The back plate is a second
  filter (the product), and the pH, BZ and Liesegang colours are absorbers in the
  light, not paint. Between 0 and 1 the two pictures fade into each other, so a fader
  can play it. Not in the photograph, which has its paper. `npm run lamp` (CI, open
  shard, 8 checks) measures it: all 41 looks at 0 draw byte for byte what the plate
  drew before (against a lab built with the lamp's lines taken out); a clear pool
  throws 100% of the lamp (§20a asks 90%), 0% on black; twice the dye lets through
  the square of once to 0.00 in every channel of three dyes (blue 0.21/0.41/0.78 →
  0.04/0.17/0.61), in the ratio of the absorbances laid down; a dense blue passes
  0.00/0.02 of red and green; a pool over a gel is the gel times the dye's
  transmission to 0.49 of a byte (164 on black, the old fault); two plates multiply
  to 0.61 of a byte, pixel by pixel; the photograph does not change. Found on the way:
  the hot-spot lifted the middle to 1.28 times the lamp, which burnt a white ground
  out (the doubling read 0.89 where the law says 0.96); the lamp ground is now set
  down by the hot-spot's peak. Halfway the picture is half of each to a byte. The gooey edge's contrast is left out of the amount (18b-4)
- **18b-1. Which looks go on the lamp. Shipped (#262), by rule rather than taste**, as the
  owner asked ("automatically judge which looks should use the lamp ground"). A PR
  labelled `lamp-gallery` photographs every look on CI's Mac at 12 and 30 s, each moment
  on both grounds a quarter second apart (`GALLERY_GROUNDS=0,1`), and `npm run lampjudge`
  reads each pair pixel against pixel (`groundPairOf` in `scripts/judge.mjs`). The rule:
  a look whose own description says it is light itself (Galaxy, Cyberpunk Neon, Aurora
  Borealis, Solar Flare, Stardust Collapse, Lumia) or a picture with its own ground (Oil
  on Water, Colorful Cosmos, Sunny Side Up, Soap Film, Roy, 1963) keeps black; every
  other look is a dish, and goes on the lamp when, at both moments and over the dish, the
  bare lamp is at most 45%, black at most 30%, and lit colour at least 20% and at least
  0.6 of what it shows on black. **On the lamp: Timbre Shifter, Microscopic Chaos,
  Poster 1969, Fillmore East 1969, Crowd Plate, Milk Marbling, Red Cabbage, Chemical
  Clock, Home Movie, Clock Glass**, and **Sensual Laboratory, the owner's pick** (2026-10-04:
  "looks washed out by the light" on black, where its Multiply lays grey graphite on a cream
  platen; on the lamp the graphite reads dark; `OWNER` in `lampjudge.mjs`). The rule had kept
  it on black on its colour gates, which a look with no colour on either ground cannot pass
  (18b-9). Ferro Maze draws the same on both grounds (its own
  dye is the light table's white) and keeps 0. The pictures, every pick and its reason:
  the gallery page linked from #262; the pictures are in the project's shared files.
  `npm run lamp` now renders every look at 0 for its byte-for-byte line and asks that the
  looks shipped on the lamp draw on it. The owner can overrule any pick (Save Look).
  Found on the way: a projector set to the film alone kept the look's lamp ground, so on
  a look on the lamp it threw the bare lamp with the film over it; the film alone now
  takes the lamp ground out too (`plateSources.ts`, `npm run map`), as `wall`'s film-alone
  line on the Mac (Fillmore East) would have found.

### 19a. `gallery.yml` holds the Mac runners

`gallery.yml` photographs every preset on a Mac on every pull-request push that touches
`src/gpu/wgsl/plate.ts`, `src/gpu/fluid.ts` or `src/gpu/wgsl/fluid.ts`, the three most
edited files, and a run that has started is never cancelled (`cancel-in-progress:
false`, so that its sheet is the next push's "before"). It ran 96 times from 2026-09-26
to 2026-09-28, 79 of them to the end at 28 to 29 runner-minutes each: about 38 Mac-hours
in two days. Meanwhile `Checks`' Mac shards waited 218 to 3,869 s for a runner in the
three green runs sampled, and one `Checks` run wants four Mac jobs at once.

*Fix:* start it by label or by hand, as `controls.yml` is for the same reason, or once
on the push that takes a PR out of draft. *Measure:* the Mac shards' queue time over
the next 20 `Checks` runs, against these.

**Shipped 2026-10-03** (the owner asked why ten open PRs were all waiting on CI).
`npm run macqueue` measured the fifteen hours to 19:14 UTC: 2,747 Mac runner-minutes, of
which `Checks`' PR shards 1,705 (62%, 341 of them on runs that failed), the gallery 812
(30%, 28 runs, every one on a push nobody had asked pictures of), deploys 191 (7%) and
the iPhone build 39. The PR shards waited 19 minutes on average for a runner, and the
account held five to eight Mac jobs at once through every busy hour, so a gallery run
was a shard not running. Two changes, neither of which runs less of `Checks`:

- `gallery.yml` runs on `workflow_dispatch` or on a PR labelled `gallery`, once per
  labelling, as `controls.yml` does. A session can add the label (it gets a 403 on a
  dispatch); `preset-auditor` now does.
- `closed.yml` cancels a PR's `Checks` and `iPhone app` runs that are still queued or
  running when it merges or closes, by joining their concurrency groups. At 19:14, #204
  had been merged an hour while three of its last push's shards were still queued and
  running, ahead of the deploy its merge started; 38 runner-minutes in the window went
  to PRs already merged. It is its own workflow, not a `closed` trigger on `checks.yml`,
  so the deploy gate can never read a run of it as a green `Checks`.
  `npm run closedruns` (in Measure) holds the three files' groups to one spelling.
  As shipped in #234 it wrote the group with `github.ref`, which for a merged PR's
  closed event is the base branch, not `refs/pull/<n>/merge`: on #234's own merge it
  joined `checks-Checks-refs/heads/main` and stopped nothing. The follow-up builds the
  ref from the PR's number, and `closedruns` now evaluates closed.yml's side as a
  merged PR's closed event (red on #234's spelling, green on the fix).

### 19b. Measure is near its timeout, and its first red hides the rest

**Shipped 2026-10-04 with 19h.** Over 87 green runs on 2026-10-03 Measure took a median
14.3 minutes and at most 14.9, against its 15-minute timeout. It is now three parts side
by side (`logic`, `sound` for the ffmpeg harnesses, `browser` for the Chromium ones), each
step with `!cancelled()`, `node --check` over the scripts in `logic` and `npm run wgsl` in
`browser`; a `Measure` job keeps the one name. The docs' "about a minute" in CLAUDE.md is
made true; `npm run check`'s "a minute" is the local run and was left.

The ubuntu job averaged 746 s over 14 runs (837 s at most) against `timeout-minutes:
15`, where CLAUDE.md says about a minute, `checks.yml` half a minute, and `README.md`
and `scripts/check.mjs` a minute for `npm run check`. By the runs' step times the long
steps are `drops` (166 s), `phone` (134), `shape` (98), `downbeat` (97), `bands` (48),
`kicks` (43) and `pacing` (37). Its thirty-odd steps have no `if: ${{ !cancelled() }}`,
so the first red step skips all the rest, where the Mac shards were built to run every
check whatever failed before it.

Two cheap gates belong in it as well. `npm run wgsl` runs on SwiftShader and is the fast
shader gate, but runs today only on the Mac `show` shard, behind its queue. And `node
--check` over `scripts/*.mjs`, `server/*.js` and `dc.mjs` takes 3.7 s: `tsc` parses only
a handful of the harnesses, so a syntax error in a Mac-only one is found after the Mac
queue.

*Fix:* two or three parallel ubuntu jobs (the audio harnesses, the browser ones, the
rest), `!cancelled()` on every step, the two gates, and the docs made true. *Measure:*
the job's wall time, and a step broken on purpose early on that still lets the later
ones report.

### 19c. Checks that can pass without measuring, and checks nothing runs

- ~~`wall`'s "at least 0.9 times what the show drew on its own" goes red on a starved
  Mac runner~~ **Fixed 2026-10-03 (§14b-2):** the floor was measured against a different
  two seconds than it judged, and the gate on a starved machine really did turn down the
  show's own next frame; both fixed, and `wall` now makes the busy machine itself.
- ~~`wall`'s busy phase half a refresh behind goes red on a starved Mac runner with the
  gate right~~ **Fixed 2026-10-04:** #223's tools shard read the wall's asks at 8.9 a
  second (0.9x under the ceiling, 11.4 drawn against a floor of 10.3) and went red on
  the lines' fixed guard of more than 10 a second, which is there so that a clock that
  never ran cannot pass a ratio at 0 of 0. The busy machine misses half the refreshes
  on purpose, so a runner handing 22 of 60 hands 11. The guard is now 20 counted in the
  seconds measured (the same 10 a second for the 2 s idle phases), and the busy phases
  measure for 4 s, so they count as many refreshes as an idle phase. Five Mac runs
  since #236 read the busy wall's asks at 8.9 to 24.3 a second, 36 to 97 counted now.
  The `check-skeptic` found what the old guard had been standing in for, both now
  checked: the busy phases were placed by a 500 ms reading of the refresh, which a
  starved runner can read as two (half a refresh behind landed a whole one behind), and
  are now placed by the shortest refresh the idle phases read (and the idle phases by the
  shortest read so far, which put three quarters behind at one and a half on the same
  emulation); and a runner whose two
  windows miss different refreshes puts the floor's bar under what a right gate draws,
  so the fault the phase is for (the gate turning down the show's own next frame)
  cleared it. On one refresh the slots served must now be at most 1.15 of either
  window's frames (the Mac reads 1.00 to 1.02).
- ~~`wall`'s busy phases' "missed from one book" can pair a refresh with its neighbour~~
  **Fixed 2026-10-04:** red once in 91 tools-shard runs of 2026-10-03/04 (f350e75, #255;
  green on re-run), reading "the wall's stamp 8.3 ms after the show's (-8.3 to 8.3)" in
  both busy phases on a 60.6 Hz display, whose half refresh (8.25 ms) is under the
  book's 8.33 ms radius. The two windows' stamps sit a different gap apart each run
  (the 91 runs read -7.5 to +8.3 ms, each within 0.1 to 0.3 ms), so once in a few dozen
  runs the gap is within jitter of half a refresh and the nearest raw stamp is a coin
  toss. The book (`bookEntry` in `scripts/wall.mjs`) now pairs around the gap the first
  refresh both windows looked up set, reset each busy phase, so a refresh's neighbours
  are a whole refresh away at any gap. The line is unchanged. A model of the book on two
  windows at every gap from -R/2 to +R/2 on a starved thread: 0 of 410 red, the book as
  it was red in 20 (all at half a refresh, "d -8.3 to 8.3", the CI signature).

### 19f. The plan and the docs, out of step with the code

- "What comes next" (2026-09-26) still says the Mixer's steps 2 and 5 are small and step
  3 is next (2 to 5 have shipped, #189 to #196), that batch 10's steps 4 to 7 are to
  come (4 and 5 shipped, #185 and #179), and never mentions §12 onwards.
- "Nothing is built" stands in the openings of §12 and §14, whose own items say
  otherwise (§12's step 4 and 4a built; 14a, 14c and 14d shipped). The running order's
  row 14 lists 14a to 14d only, and §17 has no row.
- §12's table says `public/sw.js` "already caches the build" for Android offline; 14h
  says, rightly, that it saves nothing ahead of time. §13's first "found along the way"
  point repeats 14h's first.

### 19h. What a red PR costs, and which reds were the PR's own

Reported 2026-10-03 (the owner): "The CI reviews are taking way too long and failing
constantly." Measured from the Actions API over 04:00 to 23:45 UTC that day, 183 runs:

- **Red.** Of the PR `Checks` runs that finished, 30 were red and 35 green: 46 %. 44 Mac
  shards went red; about two thirds of them on a line the PR had not touched. By line:
  the wall 13 (its timestamp line until #218's fix, then "0.9 times what the show drew",
  #236), the drop map's "nowhere else" 9 (two after #225, one on #237, which changed only closed.yml, its check and PLAN.md),
  the phone's two-finger Drop 6 (twice on main's own deploys), "every tool adds none" 4
  (none after #222), the Press's own branch 5, the startup check 3 (#235), the Magnet 3
  (#230), grating 2 (#225's own), the rest once each. A deploy's own Mac run was red 4 times
  in 9, each on a line its PR did not touch.
- **Slow.** A Mac shard waited a mean 21 to 31 minutes for a runner (deploys' 33 to 41),
  then ran a median 13.2 (tools), 11.2 (plate), 8.8 (show) and 7.8 (open) minutes; tools
  at most 15.6, and Measure at most 14.9, both against 15-minute timeouts. Of about 4,400 Mac
  runner-minutes, the gallery took 1,219 (28 %, before 19a's change landed), PR shards
  about 2,700, deploys 356 and the iPhone build 100.
- **What would not help.** Moving the lab's checks to ubuntu's SwiftShader to free the Mac:
  timed in a cloud session, `lift` takes 162 s there against 20 s on the Mac, so the lab
  would need some eight ubuntu jobs and would be measured on a software GPU. Not done.

*Shipped (PR "CI: Measure in three parts, docs-only PRs skip the Mac, the shards evened"):*

- Measure in three parts (19b).
- `scripts/reach.mjs` (`npm run reach`, and a `reach` job first in `checks.yml`): a PR
  whose diff touches only Markdown, `.claude/`, `ios/`, `desktop/`, the six workflows
  that never run a Mac shard or the three scripts that check the workflows skips the Mac shards; `WebGPU (macOS)` is green when they ran
  green or were skipped for that reason alone. Measure always runs; a deploy always runs
  the Mac; `scripts/deploygate.sh` never trusts a run that skipped it (main's code under a
  docs-only merge is whatever the last merge left, which a red deploy may not have passed).
- The shards evened: the phone's fingers (3.4 min) from tools to open, after the startup
  check; the mixer (1 min) from plate to show. By the medians above the longest shard goes
  from 13.2 to about 11.2 minutes, and none is near its timeout.

- **19h-3. The deploy's second Mac run. Shipped in the same PR, the owner's choice
  ("Skip if no overlap", 2026-10-04).** Every merge behind main (the owner's rule since
  2026-09-28) re-ran all four shards on the deploy: 14 of the last 20 merges, about 50
  minutes from merge to live each, red 4 times in 9 on lines nothing in the merge touched.
  `deploygate.sh`'s rule 5 now answers `disjoint` when the PR's run passed the Mac on an
  older main, the site files it changed (`reach.mjs --site`: src/, public/, index.html,
  the build config, the lockfile, package.json beyond "scripts") are not ones main changed
  since, everything else that differs is main's own change, and no deploy since the run's
  base went red; the deploy then runs Measure on the exact tree and not the Mac. By file
  alone it never held (every PR adds a step to checks.yml and a script to package.json);
  by site file, `npm run deploygate -- --history 20` reads 6 exact and 9 disjoint of 20,
  so 15 of 20 merges deploy without waiting for a Mac, against 6. The two it refuses share
  `src/App.tsx` (#233) and the solver (#225). What no deploy measures now: two PRs in
  different site files moving the same picture; the next PR's own run, on main with both,
  measures that.

### 19j. A merge with no site change deploys nothing

**Shipped** (#253). Eight of the last thirty merges changed no file the site is built from
(`reach.mjs --site`): docs, check scripts, workflows. A docs-only merge still ran every Mac
shard on its deploy (rule 3, because its PR skipped them): 84bb112 (#245) went live 79
minutes after its merge; a check-only merge cost eight minutes of Measure.

*Fix, shipped:* rule 6 in `deploygate.sh`. When no site file differs from the commit that is
live (the head of the last green deploy run to start before this one, on any branch, so a
re-run of an old deploy counts by when it ran), the deploy answers `nothing`, checks and
publishes nothing, and is green in seconds, so the concurrency group is free for the merges
behind it. A change to the gate or `reach.mjs` always deploys, and a filter that fails never
reads as "no site file". A changed check script still ran on its own PR; a run by hand still
checks and deploys, and is now how a changed `VITE_*` secret goes live. *Measured:* `npm run deploygate -- --history 30` gave 5 `true`, 16
`disjoint`, 9 `false` before; 5, 14, 8 and 3 `nothing` after (84bb112, 3586ead, e199bd3:
together 95 minutes of deploy time, 79 of them behind the Mac). `vite build` of each of the
three and of the commit live before it gave the same 25 files byte for byte; a site merge
(87b06a6) differed in 8. The other five non-site merges did not qualify, rightly: two were
runs cancelled before they started (a newer merge took their place in the queue), and three
followed a site change whose run was cancelled or red, so theirs was the deploy that put it
up (d027626's 111 minutes, which this section first counted as a docs-only wait, were three
PRs' site changes going out). The gain grows with 19i and 0.3: fewer red or superseded
deploys leave more docs merges directly on top of a live commit.

### 20b. A clear film that tears (the thin-film equation)

**Shipped (#259), behind Clear Film (`clearFilm`), 0 in every look; judging §34.**
What was built, against the plan below:

- The film is `src/gpu/wgsl/film.ts`: a thickness h and a solvent Γ on a grid of
  their own (`FILM_GRID` 384², at most the solver's), kernels `filmAdvect`,
  `filmMu`, `filmUpdate` and `filmSplat`, with the prototype's numbers in its cells.
  Explicit, in substeps of the film's own time (`FILM_RATE` 0.15 a second, at most
  `FILM_DT` 2.2e-4 each, twelve a frame), in flux form with each donor's fluxes
  scaled down together at the floor, so the film is conserved to rounding and no
  global sum is needed. A numpy copy of the same kernels was run first (scratch,
  not the repo): a 0.35 film with dust tore into 365 holes in 8 s, p10 1.6 to p99
  18.6 cells; a 0.8 film with no dust stayed whole for 20 s; a drop of solvent
  opened a hole from 3.7 to 9.4 cells in 7 s.
- The top glass is a linear pressure past 0.9 at 150 (the prototype's 30 let rims
  pile to 1.1 of the gap; 400 was unstable at the step).
- Dust is procedural (one candidate speck a 16-cell square, by a hash), fixed to the
  glass, a stronger disjoining pressure (1 + 0.3 · speck), which is what a speck
  the water wets does. The plan said "a slightly lower local K"; with this Π a
  lower K is a *stronger* film, so it is higher.
- Carried by the gap's Poiseuille profile: a film of thickness h against one glass
  moves at U (3h − 2h²), so a thin film lags the water and a young hole shears.
- Pours: Alcohol is now a solvent (`solvent: 1` on the bottle) and Soap counts as
  one; both land in Γ. Clear oil (any non-magnetic oil bottle) joins the film
  instead of the mix while a film is on. The plan said alcohol already went into
  the mix's surfactant channel; it never did (only `soap` does), so the film keeps
  its own solvent rather than reading the mix.
- Drawn as the dye's path through the gap less the film (18b-6), from the packed
  view: the film took eight bits of the word BZ's activator had, which keeps eight
  on a square-root scale (it is only asked whether it is there).
- Check: `npm run lace` (CI, open shard), seven cases, below.

The plan as written before it was built:

- **What:** a new liquid, a clear film against the glass. It gets its own thickness
  field h (one R32F texture), moved with the plate's flow in flux form (`mixAdvect`),
  and evolved by the thin-film equation above. The water under it is the gap less h,
  which feeds the lamp's Beer–Lambert (18b) and the optical path (18e).
- **Nucleation, never a timer:**
  - Holes open where the film is thin (the disjoining pressure's spinodal band), and
    where solvent lands. Alcohol and soap already go into the mix's surfactant
    channel, and `marangoniFlux` already moves what rides the surface. The film is one
    more thing it moves.
  - Dust is a fixed, seeded field of weak spots (a slightly lower local K), so a
    thick film left alone stays whole, and a thin one tears where the dish is dirty.
- **Kernels:** `filmMu` (p = −σ∇²h − Π(h) plus the top glass) and `filmUpdate` (∇·(M∇p)
  in flux form, degenerate mobility M = h³ or 20c's). They have the same shape as
  `mixMu` and `mixUpdate`, which are Cahn–Hilliard with a constant mobility.
- **Cost:** unmeasured. The explicit fourth-order update needs a small step. The film
  can run at half the dye's grid, with 6–10 substeps of two light passes, or with a
  few Jacobi sweeps of a stabilised semi-implicit form. The estimate is 0.2–0.4 ms at
  the 768² rung. It is skipped entirely when no film is on the plate, like the oil's
  kernels.
- **Checks:**
  - A new lab check, `lace`: the film's volume conserved over 20 s;
  - a thick film with no dust and no solvent stays whole for 20 s (holes come from the
    physics, not a clock);
  - a solvent drop opens a hole whose radius grows steadily;
  - on a dusty thin film, the hole diameters span at least tenfold (p10 to p99);
  - after the lace forms, the count of separate film pieces rises (the ligaments bead);
  - the same film on today's ground is the control.
  - The `look` skill renders it beside the still.
- **Tools and phone:** the performer's gestures are pouring the film, which is a
  bottle (15a lays it from every tool), and a drop of alcohol, which is a bottle that
  punches a hole where it lands. Both are in the phone's bottle picker and on MIDI,
  like every other bottle.

## 21. Looks after painters

**Shipped: Roy, 1963, and Ben-Day Dots.** A control (`benDay`, Settings → Look, MIDI,
the desks, the remote, and the phone's Looks sheet while a look prints) that reads the
finished picture as a comic printer would: dark is black, anything lit is white paper
with one of three process inks on it (red, yellow, blue, whichever the hue is
nearest), a pale wash is that ink laid as even Ben-Day dots on a 45° screen fixed to
the picture (32 rows down it), and a strong one is the flat ink. The front plate's
shapes are outlined in black from its dye, a pen's width (a ring of taps round each
pixel), and so are the seams where two inks meet. Only Roy turns it up: big flat
pools of the three primaries in thin washes of themselves on a white light table,
milk and ink so the shapes keep their own edges, and nothing that shades (no gloss,
hot-spot, beads, bubbles or closeup texture). `npm run benday` measures the print on
a lab plate: a wash is 242 separate dots against 256 on the lattice, one size to
2.7%, fixed while the plate turns; a pool is one flat ink with a line all the way
round it and a line where red meets yellow; and only Roy prints.

## 22. Spin the plate

**22a, shipped (#223).** The **Spin** tool (N on the desks, a tool on the phone's dock and the
remote's pad), and **Auto Spin** (Off, Rate in rev/min either way round, Tempo at a turn
every 1–64 beats) with **Reverse Spin**, on the sheet, the phone's Play sheet, the
remote, MIDI and the desks. Off by default, so every look is as it was.

The dish is a real rotating dish, not a turned picture (`src/lib/turntable.ts`, the
`spinSwirl` kernel in `src/gpu/wgsl/fluid.ts`):

- **The glass drags the liquid round through the gap.** The bulk of the liquid follows
  the dish with the gap's drag time τ = h²/12ν: at the 6 mm rest gap water takes 3 s,
  the thick liquid 0.15 s, oil 0.06 s. The picture is the liquid, so it trails the
  glass by Ωτ at a steady turn. `npm run turntable`: 63% in one τ at any frame rate,
  the lag Ωτ to 2%.
- **Where the gap is tight the liquid is gripped harder.** What is left of the dish's
  turn after the bulk (A = Ω − ω_l) drives a swirl w with the Hele-Shaw drag
  k = 12ν/h² in each cell: dw/dt = A(k − k0) ẑ×r − k w, integrated exactly. A pressed
  palm goes round with the glass (0.86 of A r) while the plate away from it barely
  moves (0.029); a domed plate swirls at A r (1 − h²/h0²) to 1.3%; oil in water is
  gripped harder than the water (0.69 against 0.087). `npm run dish`.
- **Spun, the heavy goes out and the light comes in.** The centrifugal force on a
  density contrast β is −∇(ω² r²/2)·β: dense dye (Solutal Buoyancy's contrast) is flung
  outward and oil (12% lighter) drawn inward. `npm run dish`: +1.75e-2 and −1.12e-2.
- **Tempo is locked to the beat**, not only to its speed: the dish is steered to where
  the counted beats put it, so a knock is taken back (0.008 rad off, 20 s after a
  0.5 rad/s flick) where a motor asking only for the speed stays knocked off (0.73).
  With no beat heard it turns at the Rate; a beat once heard is held.
- The swirl only runs while the dish and the liquid turn at different speeds (or the
  liquid turns), and a tail after; otherwise it is zero-filled and skipped, and the
  flow the dye rides is a still plate's to the bit (`npm run dish`, "largest
  difference 0").
- The phone's landscape dock now goes to one row at 860 px, not 800: eleven buttons on
  the tools' side need 856. The desks' tool row wraps inside its column at 1024.

- ~~**22h. The look's own turning is still rigid.**~~ **Shipped** (#252). There is one
  dish under a plate now. The look's motor, the music routed to rotation and a flick
  turn the same glass as Auto Spin and the Spin tool; the speeds add, the liquid follows
  their sum with its drag time τ = h²/12ν, and the picture turns with the liquid alone
  (`dishFrame` in `src/lib/turntable.ts`). The twist's flick half, a stir in the current
  standing in for the drag the rigid picture was not getting, is retired: kept, it
  would have dragged the liquid twice. Measured (`npm run turntable`, checks 10–14):
  - a look nobody turns is exactly still, ten minutes at 60 fps;
  - a flick on water leaves the picture behind (0.061 of the glass's 1.83 rad/s after
    0.1 s) and it comes up to the dish on the exact answer for a coasting dish, to
    0.83% at 1 s and 3 s, at 60 and at 144 fps. On the thick liquid it is with the dish
    (0.998) within half a second;
  - a steady motor turns the picture at its speed, Ωτ behind where the rigid picture
    was (0.00299 rad on acid-trip's motor, the fastest shipped);
  - a sway every eight seconds reaches the picture at 1/√(1 + (ωτ)²) of the dish's:
    0.391 through water, 0.993 through the thick liquid.
  `npm run flick` (Mac, the tools shard) holds the frame to that arithmetic: a flick on
  water at the drag time's speed, the picture through the liquid's angle and not the
  glass's, the angle lost to the glass after two drag times to 15%, the turntable's
  share through the same water, the solver handed Ω − ω_l and no twist.

  What it changes on the shipped looks, worked out on the frame's own flywheel with a
  made-up band (galaxy, acid-trip, solar-flare, deep-ocean): on the nine thin looks with
  music routed to rotation the picture is within 0.035 rad (2°) of where the rigid one
  was, and the swirl's drive Ω − ω_l is up to 0.011 rad/s, over 1e-3 about 90% of the
  time, so the swirl runs while they play; on deep-ocean and neon-coral-reef (thick)
  it is 0.003 rad and 0.0025 rad/s. Looks with no music and a motor (most) end Ωτ, a
  few thousandths of a radian, behind. Looks that do not turn are unchanged to the bit.
- ~~**22j. The look's motor still stirs the middle.**~~ **Shipped** (#261). The
  Rotation Speed dial stirred the current round the middle as well as turning the
  dish: `rotationSpeed` × 30 in the solver's units, a swirl w(r)² fastest at the
  centre and nothing at the rim (w = 1 − smoothstep(0, 0.5, r)), on the look's own
  clock. A dish turning steadily under its liquid drags it round through the gap until
  it turns with the glass, and leaves nothing to stir, so the stir is gone from the
  solver (GPU and CPU) and the dish does what the glass does (22h's dishFrame and the
  swirl). Its speed is ω(r) = 30 · dial · w(r)² · dt · Advection · 190/192 · 60
  rad/s, and the lab held the stir to that before it went (thin gap and old plate
  alike, within 2% from r = 0.05 to 0.35): acid-trip's 0.87 rad/s at r = 0.05 where
  the formula says 0.89, 0.95 at the centre, against its motor's 0.001; Classic's
  0.0019 at the centre against 0.00008. On every look with a motor the stir moved the liquid
  twenty to a thousand times faster than the motor turned the dish. So each look's
  dial was moved up the dial to turn its dish at the mean speed the stir and the old
  motor gave the liquid in the projector's 16:9 window (the plate is drawn at 1.5
  times the window's width, so the window is the middle ±1/3 by ±3/16 of the plate;
  the stir's mean speed there is that of a rigid turn at 0.322 of its centre's), on the look's clock at rest, for the front plate: acid-trip 0.1 → 0.421
  (0.306 rad/s, a turn every 20 s), cyberpunk 0.05 → 0.287 and stardust-collapse
  0.06 → 0.282 (0.10 rad/s), boiling-point 0.218, timbre-shifter 0.202, fractal-dream
  0.187, solar-flare 0.183 (0.02–0.04 rad/s), the rest 0.008 to 0.156 (under 0.01
  rad/s), each to 3% of its target (`presets.ts`, the note above the list). And the
  music's sway no longer carries the motor: with a band routed to rotation gone quiet
  the sway is −0.8, which reversed the dial's share with the band's; harmless at a
  thousandth of a radian a second, it would have turned acid-trip backwards at 0.24
  rad/s in every quiet bar (`lookMotor`, `npm run turntable` 15). Lucky's dial rolls
  0 to 0.2 (was 0.025). A dish whose motor is over about 1.25e-3 rad/s now starts
  the swirl in its first steps (the liquid lags the dish as it comes up to speed), so
  the opening waits for `spinSwirl` on those eighteen looks (`lookOpensSpinning` in
  `gpu/opening.ts`; `npm run startup` found six of them asking for it unbuilt). Judged on the Mac, `docs/judging.md` §28.

  What it cost, timed on the GPU (`npm run swirlcost`: a run of swirl stages back to back,
  submit to done, the slope between two counts so the submit's own cost drops out), laptop
  and phone layouts, the governor's own grid (256² on CI's Mac):

  | | thirteen dispatches (before) | one (now) | GPU share now, at the steps that ran it |
  |---|---|---|---|
  | phone, nine looks (median) | 105 µs a step | 45 µs | 0.07% (14 steps/s) |
  | laptop, nine looks (median) | 272 µs | 75 µs | 0.17% (22 steps/s) |
  | Acid Trip, Cyberpunk, Stardust Collapse at #261's motors (set by hand on the build before it), phone | 97–110 µs | 41–51 µs | 0.07–0.08% |

  So it was never a frame-rate problem: under 1% of the GPU's time before, under 0.2% now,
  and the frame rate alone cannot see either. The same page alternated swirl on and off
  read 26.4 against 27.3 fps on the phone and 40.9 against 42.2 on the laptop, but each
  look's own pair scattered by five frames either way and an earlier run of the same app
  read 30.6 against 30.3. The laptop's bench is the noisier: its first form (20 and 220
  stages) read three looks in twelve negative, so the script now times 20 and 1020; the
  table's laptop row is the median of that first form.

  The cut is physics, not a shortcut. On a thin plate the swirl field is the dish's drive,
  a speed at the rest gap, handed to the thin solve with the current; the solve makes the
  whole flow conserve liquid, ∇·(hu) = 0, by its multigrid. Projecting the drive first by
  ten Jacobi sweeps of ∇·u = 0 did a weaker version of the same job with the operator that
  ignores the gap, so it is gone: one dispatch, spinSwirl alone. `npm run dish` (lab): a
  pressed palm 0.307 → 0.306 of A r, the plate away from it 6.08e-3 → 6.04e-3. The old plate
  (Thin Gap off) keeps its projection, because nothing after the swirl projects it there.

  The floor stays a speed. Set from the travel it makes in a drag time, it would have saved
  steps; at under a fifth of a percent of the GPU there is nothing worth saving, and a lower
  floor would only run the swirl on more of a song.

  - **CI's Mac grants no timestamp queries.** `chromaglassDebug().webgpu.timestamps` reads
    false there and the profiler reads nothing, so `npm run stages` and `npm run ladder`
    measure nothing on CI; only the owner's machine gives per-pass times. `benchSwirl`'s
    submit-to-done timing is the way round it for one stage.
  - **`npm run flick` read the plate between frames.** It went red once on #258 (water at
    0.117 against the drag time's 0.179) on an app it had passed an hour before: it took the
    page's clock at the read against the last frame's speeds. It now times by the plate's
    own clock (`chromaglassDebug().frameAt`) and read 0.188 against 0.188.

## 25. Areas of interest: several places on one plate

**Why a look had one.** Read off the code, every look was built to have a single area
of interest:

- Every look's music worked from the middle of the dish: the kick's ring of dye, the
  burst on the velocity route, the pulse on the density route and Beat Squeeze's press
  were centred on the plate's middle, and the mid's stream circled it at 0.3 of the plate.
- 29 of 41 looks set Center Gravity (a concave dish: heavy dye slides to the middle),
  and the dish turns about the middle.
- Nothing made one part of the plate unlike another for long. A look's liquids were
  laid as fifteen spots anywhere and topped up wherever the automation's drop landed,
  so soap or glycerine was spread thin over the whole glass; each drop's colour was a
  fresh pick from the look's dyes.

Velvet Underground was the plainest case: its four seed pools, Gaussians 18–25 cells
(128-grid) wide, overlapped into one wash covering 92% of the plate (the lab, one lit
region over density 0.3, 4% of the plate dark), bass routed to both the burst and the
pulse in the middle, and Center Gravity 0.35. Lumia laid no dye at all and its
automation dropped one every three minutes, so its picture was the lumia light layer
alone: a texture over the whole frame with no place in it.

**The mechanism (25a, shipped).** `src/lib/plateAreas.ts`: a look may name two to four
areas of the dish, each a place (centre and radius, in the dish's frame), a liquid, a
dye (an index into the look's dyes, each area a different one; a palette lock still
wins, and a hue journey or the sequencer turns all the areas' dyes on together, so they
stay different colours) and a band of the music. Laying the look pours each
area's dye as a pool with its own rim of drops and each area's liquid into it; the
automation's drops land in the areas (weighted by size), in each area's dye and
liquid; the bass's ring, burst, pulse and squeeze land in the bass area (taking several
in turn, kick by kick), the mid's stream circles the mid area's edge, the treble's
sparks fall in the treble area (a look with no mid or treble area of its own takes its
areas in turn, eight seconds each). The Color route still moves the colour, cycling
between an area's dye and the next one, and a kick's ring is the other of the two
against its pool. A Go and the sequencer pour into the same places. A
hand that picks the plate's bottles keeps the areas' places and colours and pours what
was picked. What happens in each area is the liquid's own physics already in the
solver (liquidPhase.ts: glycerine's body, soap's Marangoni, syrup's weight); nothing
paints a region. A look without areas plays exactly as before, its dice drawn in the
same order. `npm run plate` checks every area look: real liquids the look lists, dyes
in its set, inside the plate, areas apart, and the routing the app uses.

Velvet Underground, Lumia and Cell Bloom are rebuilt on it (judging §34):

- **Velvet Underground**: a magenta glycerine pool the mids circle (top left), a
  raspberry soap well the bass breaks open (right), ultramarine syrup glittering with
  the treble (low middle). Center Gravity 0.35 → 0, Dye Budget 0.85 → 0.45 (violet
  between the pools), automation 0.04 → 0.08, liquids ink/glycerine/syrup →
  glycerine/soap/syrup. Lab, laid plate: 1 lit region (92%) → 3 (8.6, 7.6, 7.5%),
  dark 4% → 73%. The same plate run for 15 s of kicks in the lab kept the old one as one
  region (92.5%); the run on the new plate stalled on software WebGPU and is owed (25e).
- **Lumia**: three veils, two in glycerine and one with soap in it (spread thin and
  opened), under the unchanged lumia light. Dye Budget 0.1 → 0.2, automation 0.008 →
  0.03, soap added to its liquids.
- **Cell Bloom** (added by the owner the same afternoon): a closeup look, and its one
  area was its camera's. Follow mode locked onto the pool nearest the middle and rode
  it, and at its 3.5x zoom its Paint Cells were never drawn: at Cell Size 0.32 a cell
  is too small on screen to resolve (`resolved` in wgsl/plate.ts starts the coarse
  cells at 3.9x), so the lab drew it as a plain wash. Now three small pools (silicone
  and magenta, oil and lavender, silicone and ultramarine) sit round the middle
  inside one closeup frame, the camera holds on the middle (follow → hold) and the
  dish's turn carries them round under it, and Cell Size 0.32 → 0.6 so the cells are
  drawn at its zoom.

