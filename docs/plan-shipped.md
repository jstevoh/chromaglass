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
