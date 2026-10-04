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
