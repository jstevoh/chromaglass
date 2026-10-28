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

### 13-update. The Mac app's download, its releases and its updates (2026-10-25)

Asked by the owner on 2026-10-25, after the app was built and put in Applications by hand:
"don't we also need to create a download link on the webpage/profile? and whenever we have a
new release update that app? and also allow updating of the app from inside the app itself?"
The same day they chose a public download ("public download is fine"): Pro is checked inside
the app against the key (23.11), so a GitHub Release on this public repo is the file.

- **A release** is the owner's call: Actions → *Mac app* → *Run workflow* with *release*
  ticked, or a `desktop-v<version>` tag. `desktop.yml` builds and checks the app as every run
  does, then a `release` job on Ubuntu (no Mac minutes; the only job that may write) publishes
  `desktop-v<version>` as the newest release with the .dmg under a fixed name
  (`ChromaGlass-mac-arm64.dmg`), the zip, the blockmaps and `latest-mac.yml`. Not every merge:
  main takes several a day and each would tell every installed app to update. The version is the
  site's major and minor and the run's number, so nothing has to be bumped first (13-version is
  what that leaves).
- **The download**: Profile & Store has a Mac app card (`MacAppCard.tsx`, `src/lib/macApp.ts`):
  Pro on a Mac gets Download for Mac; Pro on a phone, an iPad or a PC is told to open the page on
  the Mac (the phone version); Free and Home are told it comes with Pro. The landing page's Pro
  tier lists it, with a download line for a Mac. The link is GitHub's `releases/latest/download/`
  of the fixed name, so a release never needs a deploy to be found.
- **Updates in the app** (`desktop/updates.js`, electron-updater 6.8.10): twenty seconds after
  opening and every six hours it reads the newest release's `latest-mac.yml`. macOS replaces an
  app in place only when it is signed with a Developer ID (Squirrel.Mac checks the new copy's
  signature against the old), and the owner has deferred the Apple account, so the build records
  whether it was signed (`chromaglass.signed` in its package.json) and: ad hoc, the menu's
  *Download ChromaGlass <version>…* and the profile card's button open the new .dmg; signed, it
  downloads and installs on quit, with *Restart to Update*. It never restarts, opens a window or a
  box by itself; one notification at most, none while a projector window is open; Check for
  Updates… is the only box. What it found stays found through a later check that fails offline or
finds the same release again, and on a signed Mac Restart to Update waits until Squirrel.Mac
itself has the update (electron-updater says it is downloaded before Squirrel has taken it, and
a click then would queue a quit for whenever Squirrel finished). A release runs only from main or
a tag.

Measured: `npm run updates` 69/69 (every updater event in order with stand-ins, what it must not
do unasked, and that the builder config, the app and the site agree on the .dmg's name and the
feed); `npm run desktop -- --packaged` 11/11 on the Linux pack, its new "updates" line the shipped
electron-updater reading a feed the check serves (`1.3.0 → 999.0.0 (idle → checking →
available)`, the menu's *Download ChromaGlass 999.0.0…*, the page's profile card seeing the same and told it as it happened: `checking → available 999.0.0`).

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

*0-tap, the tapped clock's two stopwatches. **Shipped in #308** (2026-10-06).* "The tapped
beat drives the show's clock" (`npm run squeeze`) went red twice on trees that could not
move it: 396.6 against 401.4 ms on #195's deploy and 401.7 against 404.1 on #216's show
shard, a docs-only tree, while #203 and #211 on the same code read 405.8 against 405.8 and
403.2 against 403.2. It compared the beat clock's period with the harness's own mean tap
interval. But the harness stamps each tap in the page just before calling
`chromaglassAction('tap-tempo')`, and the app stamps it again inside `tapTempo`, so a pause
between the two (a collection, the first call into `runAction` on a busy runner) lands in
one mean and not the other. Both reds read short, which is what a late first stamp does:
14.4 and 7.2 ms spread over three gaps, where the check allowed 2 ms on the mean. The clock
itself is handed the tempo source's reading by `setExternal` every frame with the same
`now`, so it was on the app's period throughout. The check measured the dispatch.

Now the app exposes the tempo source's reading under `?debug` (`chromaglassTempo()`, in
`App.tsx` where the source lives, rather than on `chromaglassDebug()`, so the fix did not
need `LiquidVisualizer.tsx` while #307 held it), and the check asks two claims, each on one
stopwatch. The feature: the clock's period is the tapped source's to within 0.5 ms, and
that is not the band's 492. The dispatch: the source's period is the harness's mean to
within 30 ms, six times the worst gap seen (4.8 ms on the mean) and well under what a
dropped or doubled tap does (100 ms or more). On the owner's Mac, real WebGPU: 400.1
against 400.1 ms, and 400.1 against 400.1 ms; 9/9. Controls, each run and restored: the tap
ignored by the app read the clock at 491.5 ms with no tapped tempo, both claims red; the
clock ignoring what it is handed read 491.8 against a source of 401.2, the first red and
the second green; the second tap dropped read 603.9 against the harness's 402.6, the
second red and the first green. They also found that "and the show kicks on it" passes
with no tap at all (25 and 24 kicks against a floor of 22.5), written into PLAN §0.

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

#### 8-v2. Desk v2: one desk, three layouts (2026-10-10)

`src/components/desk/Desk.tsx`, `DeskPanels.tsx`, `PanelBrowser.tsx` (new),
`src/lib/deskLayout.ts`, `src/hooks/useDeskLayout.ts` (new), `src/components/ui`
(`Knob`, `PanelFrame`), `SettingsPanel.tsx` (`embed`, `scope="stage"`), `App.tsx`;
`PerformDesk.tsx` and `DesignDesk.tsx` removed. Checks: `npm run desklayout` (new),
`npm run layout` (extended).

The owner's design (a design project, handed over as a zip) replaced the two
fixed desks with one desk whose cells are filled from a layout. Every settings section
is a panel under its own id, beside the desk's own panels (cues, rides, recipe,
bottles, dyes, tools, the phone link). A panel docks in the left or right column or the
deck under the plate, floats over the plate, folds to its header or closes; its grip
drags it between them. Build (the Design desk's job), Gig (the Perform desk's) and
Load-in (new: the controller, the sound, the wall and its mapping) are three shipped
layouts; each remembers where its panels were, stored only once it differs from the
shipped one, the rides' lesson. ⌘1/2/3 switch them, ⌘P opens the panel browser (the
sheet's search, by what a section is about), ⌘, the Stage sheet (the room and the
machine), ⌥D folds the deck, Tab hides the floating panels.

What was kept, and why:

- **Preview is the old Design desk's hold.** The plate bar's Live | Preview replaces the
  Perform/Design split. `designing` in App is now "the plate in Preview", so the
  sequencer, a song's show and a new song's look hold off while a look is built, as on
  the bench. Build ships in Preview (the design drew it Live) so the bench behaves as it
  did; a true offline copy is 8b.
- **The old ids.** The root is `design-desk` in Build and `perform-desk` in Gig, the header
  still says `design`/`perform` underneath, and every control kept its test id, so
  `qa`, `saves`, `bubbles` and the rest find what they found.
- **Knobs are real range inputs**, drawn over. An encoder or nothing learned gets a knob,
  a fader a slider (the design's rule). The rides stay sliders.
- **A section on a desk is held to the desk's rules.** Drawing them as panels found what
  the sheet never had measured: a 4 px rail on the Wall's masks and gain, two 20 px
  switches in Audio Input, a 22 px ⓘ and inline links. Each is 24 px now, and `layout`
  docks every panel there is and measures it.
- **One control, once.** Blackout moved to the header in every layout (the sheet's copy
  is gone under a desk); the recipe leaves Evolve and All settings to the rides when
  both are out.

Measured: `npm run layout` 39 → 58 checks, all green, at 1440/1280/1024 and phone
widths, with all 33 panels docked at once (511 controls) each drawing its body; `npm run desklayout`
40/40 (it found two real faults in `sanitizeLayout` on its first run: a panel twice in
one list kept both, and a stored array read as an empty layout). `panel` 180/180,
`desk`, `saves` 33/33, `phone` 292/292, `remotemix`, `rowfade`, `backplate`, `intro`
12/12 unchanged in what they assert.
#### 8-draw. Draw: the phone or iPad as the wall's pad (2026-10-10)

`src/components/DrawScreen.tsx` (new), `RemoteControl.tsx`. Check: `npm run draw` (new,
in the Measure job's browser part); `applink` and `remotemix` now start on Draw.

The Desk v2 design's #3c (phone) and #3d (iPad). The remote already had the pad as a
full screen, behind the Projectionist's Full button, with the tools and dyes as chip
rows under it. Draw makes it the screen the remote opens on, with dyes down one edge,
the four tools (Drop, Blow, Press, Stir) down the other, and Amount, Lucky, Freeze and
Blackout along the bottom; the iPad adds the bottle list, a Layer row and Clear. The
old page is Controls, one tap away, and which of the two a device was left on is kept
on it, so a tablet set up as the Gig remote opens as that again after a reload.

- **Nothing on the wire changed.** Draw is handed RemoteControl's own pad handlers
  (the 30 Hz drag, the 60 Hz held press, the press repeats), not a copy of them.
- **A touch lands in the wall's 16:9 frame**, the largest that fits the pad, and a
  touch outside it on its edge. The old full pad stretched the wall over the whole
  screen, so on a portrait phone a circle came out on the wall as a flat ellipse.
- **Amount** multiplies what a touch lays, 0.1×–2×: the display reads a pad's amount
  as 0.05–1 with a finger at 0.5, so that is the whole range and nothing past it.
- **Blackout** is tap to fade (latched) and hold to go dark while held, both through the
  display's one toggle, which fades over 1.1 s; a true snap is 8-draw-c.
- **A phone on its side** keeps the phone layout (the short side decides, as
  `lib/phone.ts` does) with the bottom bar in one row: 316 to 444 px of frame width.
- In the app, a wrong key or a missing laptop puts Change laptop in the frame, under
  the words that ask for it.

Measured (cloud): `draw` 76/76 (phone, phone on its side, iPad both ways, wrong key),
`applink` 49/49, `remotemix` 17/17. Pictures: the project's draw-8 folder.



#### 8-draw-a. The wall under Draw's pad, and touches that land under the finger (2026-10-10)

`src/lib/padPicture.ts` (new), `DrawScreen.tsx`, `RemoteControl.tsx`, `App.tsx`,
`LiquidVisualizer.tsx` (the frame task's tap and `wallToPlate`), `remoteProtocol.ts`.
Check: `npm run drawwall` (new; Measure's browser part) and `drawwall -- --app` (the
Mac's tools shard).

Reported: Draw's frame was black, so a hand drew blind on the phone. The laptop now
sends what it drew: in the frame task (the only place a presented WebGPU canvas can be
read; the projector window is drawn the same way), a copy as wide as the pad's frame
(160–480 px) is encoded as a JPEG in a worker and sent over the relay, at most 15 a
second, up to three in flight. Not the canvas's `toBlob`: Chromium runs it in the page's
idle time, and the Mac's show, drawing every frame, got 2 pictures a second from it. Not one
in flight: each round trip (bitmap, worker, answer) waits for gaps between the show's frames,
and one at a time came to 4.3 a second at 18 frames. On WebGPU, not from the canvas at all:
a 2D canvas's copy is the GPU's too, and its readback waited behind the plate, 6.3 a second
at 30 frames with three in flight. The engine shrinks the frame's texture in one small pass
on its own device and reads it back a frame or two behind, as the flash probe does
(`gpu/padGrab.ts`), and the worker encodes the bytes on the CPU. Not a WebRTC video track: that needs signalling through
the relay, ICE on a show network that may not route between two Wi-Fi clients, and a
decoder that buffers, which is latency a hand feels. Nothing is sent until a remote on
Draw asks; it renews a three-second lease every second, so a phone that locks or leaves
Draw stops the pictures without saying goodbye, and the relay stays stateless. The pad
paints each picture by hand on a canvas (no React render per picture), latest-wins,
dims it when pictures stop for 2 s, hides it while unlinked, and takes its shape.

Found while building it: the pad's touches were the plate's points, and the wall shows
the middle of a plate half again as wide (1/1.5 of it across a 16:9 wall, 0.375 of it
up), turned with the dish. A touch at the frame's top went to plate y = 1, off the wall,
and on a turned dish (Classic's was about 110° round in the cloud probe) a touch away
from the middle landed round from the finger. Pad
messages now carry `wall: true` and the laptop maps them through its own pointer's
camera (`wallToPlate`: overscan, the dish's turn, the closeup, layer 2's view); a stroke
maps both ends, a pen's lean is turned and keeps its length, and Spin leaves the dish's
turn out (it reads the hand's angle as the room sees it). Without the flag (OSC, an
older remote) the point is the plate's, as before.

Measured (cloud): `drawwall` 16/16 (15.0 pictures/s, 6.2 kB each on a textured 4:3
test card; quarters the right way up; frame 333×250 = 4:3); controls: a lease that never
lapses fails "stops sending" (161 → 176), a frame that ignores the picture's shape fails
"4:3" (444×250). `draw` 76/76, `phone` 351, `layout` 58, `applink` 49, `remotemix` 17,
`panel` 180. On the Mac (`drawwall --app`): the pad's picture is the plate's colour
(159,53,82 against grabFrame's 159,53,82); on a dish turned a radian, four drops from
the pad changed the finger's cell by 287 (median cell 4, drift 5, centre 0.69,0.58 for
0.69,0.58); the same point without the dish's turn changed it by 11 (it landed at
0.56,0.82), and the old plate point by 3.
#### 8-play. Play: the phone's listening screen (2026-10-10)

`src/components/phone/PhonePlay.tsx`, `src/lib/playGesture.ts`, `src/components/ui/TouchSlider.tsx`
(new); `src/lib/phone.ts` (`phoneScreen`, `/play`), `PhoneStage.tsx` (Play screen in More),
`App.tsx`. Check: `npm run phone`'s Play part.

Desk v2 shipped with the phone unchanged, and the owner asked for the phone and tablet
versions. The design's screens 3a and 3b are Play, "a standalone phone app for casual use",
for the buyers the owner wants beside the VJs: someone with a record on at home. The phone
layout before it (PhoneStage, #173) is a performer's, sixteen buttons in a performer's words.
So a phone now opens on Play: the plate edge to edge, the look's name with Shuffle and
Record over it, and a glass tray of eight dyes and Drop, Blow and Press. The tray's handle
pulls up the sheet: Speed, Turbulence, Swirl, Soap, Zoom and Evolve as touch sliders (44
rows, the desk's travel and Speed's curve), the looks as tiles to swipe, Follow the music
(the microphone, with Sound Drive brought to the middle on a look that has none, 8-play-d)
and Wander on its own (Evolve), then Shuffle, Clear plate and Share clip (the phone's share
sheet with the take as a file, or a download). Save is at the top while the sheet is up.
All controls on the tray is the full phone layout; Play screen in its More sheet comes
back, and the choice is kept on the phone. `/play` is Play on anything, which is how an iPad
gets it, at the design system's iPad sizes (dyes 56, hands 72); `?play=0` is the full layout,
which the checks written against it now open.

With Drop on the tray the touch picks its own hand, as the hint over the tray says on the
first three visits: a tap drops, a drag streaks, two fingers blow, a still hold (450 ms)
presses. Each is a tool the plate already has with its own physics; the reading only picks
which, and a touch keeps the hand it became until every finger is off. On the closeup two
fingers stay the camera (the plate's pinch), and the hint says "pinch zooms" there. Save
asks for a name every time, as QA-18 has it everywhere else.

Measured: `npm run phone` 292 → 368 under `PW_WEBGPU=1` (the hands' six, read from the
tool and the hands the plate's loop holds, need the plate; without it they are reported as
not run, and the Mac shard requires them). `saves` 33 → 38 (Play's Save), `layout` 58/58,
`applink` 48/48 (Play here now lands on Play, and the Laptop remote is reached through All
controls, 8-play-a), `intro` 12/12, `panel` 180/180, `desk` 27/27.

#### 8b. Preview builds on a copy (2026-10-10)

`App.tsx` (`drafting`, `wallLook`, `sendDraftToWall`, `wallRef`), `LiquidVisualizer.tsx`
(`draft`, `hidden`), `desk/Desk.tsx` and `deskProps.ts` (`onOpenWall`), `scripts/draftwall.mjs` (new).

What was wrong: Preview held the sequencer, a song's show and a new song's look, but the
plate being built was the plate on the wall. The projector window is painted from the
show's one canvas (`__chromaglassMirror`, in the frame task), so every slider tried while
choosing the next look was on the wall as it was tried, under a plate bar that said
"preview · not on wall".

What it does now: while Preview is on and a wall is up (the projector window, a cast
receiver or a network display), App mounts a second visualizer, `draft`, in the desk's
preview. The first carries on drawing the wall, hidden from the desk (`visibility`, so it
keeps its size and its frames), with the look it had when Preview took the desk off it.
The desk edits go to the copy without each call knowing: `visualizerRef` is the copy then,
and the show's calls (the music's harmony and triggers, the sequencer, a song's show, the
remote's hands, the projector's size, the render) go through `wallRef`. The room's
settings (the dimmer, the mixer, the logo's and the film's levels, `RIG_KEYS`) still reach
the wall from the desk, and so does the music. The desk's clears, seeds and drains do not.
A receiver that draws its own plate is sent the wall's look too.

Send to wall (⌘⏎) hands the copy's look to the wall as a Go does: the dyes and pours
adopted, the colours handed over, the settings faded over the Go's fade. With no wall up,
Send to wall opens the projector window as before, and the header's Wall dot always does.
Live puts the desk back on the wall's look, counters and all, so switching to Live never
changes what the room sees; the copy's unsaved changes are dropped. The wall closing
mid-Preview takes the copy down, and the desk carries on from the copy's look on the one
engine.

Why a whole second engine and not a third plate in the first: the frame loop walks every
plate it holds (tilt, stir, evolve, pours, the hands), so a draft plate there would be
moved with the live ones and drawn into the wall's frame. A second engine is its own
device, solvers and passes; it leaves alone what is the show's (the projector's paint
hook and frame asks, the debug hooks, the crash log's providers and heartbeat, the
recorder's `#liquid-canvas`). With no wall up Preview stays one engine, so a Build session
on a laptop pays for one solver, not two.

The pre-push review found the edges, all fixed and measured: in the render where Preview
ends the copy is gone before the desk is put back, and the wall's engine and a receiver
were handed the copy's plates and counters for that one render (a plate dropped in front
of the room; a receiver kept the copy's look). The wall's engine and a receiver now follow
`wallLook` while it is held, not `drafting`. Live in the middle of a Send's fade landed
halfway; it lands on the look being sent. The copy is composed at the wall's shape
(`setStage`), the palette lock and the mark reach both engines, a film goes to the wall,
the desk's Spin to the copy, Live puts back the saved look that was open and the wall's
back plate, and a built-in's id is never handed a null contract (the plate tables are
module constants both engines read).

Measured: `npm run draftwall` 20/20 (new; Measure's browser part, and the Mac's open
shard with `--frames`, where the line on what the projector window draws from must see
frames). It reads every plate count and clear an engine was handed and every state sent to
a receiver (`handed` on the debug hook, `sent` on the cast hook), because a value handed
for one render is gone before a poll can see it. Controls: the wall's engine handed the
desk's settings fails "and not the wall's engine" and "across the fade" (16/18); the wall
following `drafting` instead of `wallLook` fails "nor for a render" (plates 1/2/1/2, clears
2/0/2/0); the clear line's own control is in the run (with one engine the same clear
reaches the wall, 0 → 1). `layout` 72/72, `phone` 352/352, `panel` 180/180, `desk` 40/40,
`desklayout` 40/40. Found along the way: 8b-1 to 8b-5.

Afterwards (2026-10-11): "across the fade" read the wall once, 0.4 s after Send, and
went red on main's deploy after #339 with the fade 0% along; four green Mac runs had it 20,
14, 6 and 3% along, so the reading measured how soon a loaded page answered the key. It
now reads the wall until it lands and asks for three or more readings between the looks
and at least 1 s from the last on the old look to the first on the new (2.02 s here, 36
readings). Controls: an instant Send fails (0 readings, 0.05 s), a 0.3 s fade fails (0.38
s), and so does a page stalled 1.1 s inside the Send (the wall's fade cut to 0.92 s).

#### 8g. A panel in a window of its own (2026-10-10)

`desk/PanelWindow.tsx` (new), `desk/Desk.tsx`, `ui/index.tsx` (`PanelFrame`), `desk/DeskPanels.tsx`.

Every panel's header has a fourth button (and its menu a row), Open in its own window: the
panel moves to a window of its own, sized as it was drawn, for a second display at a gig,
and its place on the desk becomes a card that says so and brings it back. The window is a
blank one with the page's stylesheets and theme copied in, and the panel is the desk's own
React tree portalled into it, not a second copy of the app: every control in it is the
desk's state, so there is nothing to keep in step and no second solver or sound. The
window is kept beside the layout, never in it (a reload has no window to put it in), and
closing it, by its Bring it back button or by the system, puts the panel back where it
was. The clean screen on the laptop leaves the windows up (the desk is kept mounted, not
drawn, where it used to be unmounted); the page closing closes them. The Rides' Mixer sheet, the Dyes'
palette menu and the Tools' options open in the panel's own window (a `PortalBody` context), not on the other
screen. A browser set to refuse windows floats the panel instead. A phone has no second
display, and the remote has no panels, so this is the laptop's.

Measured (cloud): `layout` 68 → 72 (a deck panel opens in its own window with its 8 knobs
and the desk's background, rgb(17, 17, 19), while its place on the desk holds the card and
no knobs; a clean screen keeps the window and its panel, and Esc brings the desk back with
the card; a knob turned in the window 0.313 → 0.564 reads 0.564 back on the desk after the
window is closed; with `window.open` refused it floats). Controls: with the stylesheets not
copied the first check fails (the window's panel reads rgba(0, 0, 0, 0)); with the desk
unmounted on a clean screen, as it was, the window is gone and the clean-screen check fails.

#### 8c, 8d, 8e, 8f, 8h. The rest of Desk v2's small pieces (2026-10-10)

`src/lib/knobDrag.ts`, `src/lib/qr.ts`, `scripts/qr.mjs`, `scripts/wallpattern.mjs` (new);
`ui/index.tsx` (Knob, Slider), `ui/TouchSlider.tsx`, `desk/DeskPanels.tsx`, `desk/DeskHeader.tsx`,
`OutputPanel.tsx`, `lib/midi.ts` (`controlKindOf`), `lib/outputConfig.ts` (`WallTest`),
`gpu/output.ts` and `gpu/wgsl/output.ts` (the wall test), `App.tsx`, `PhonePlay.tsx`.

- **8c** A knob takes hold where the hand does: on its cap it is the vertical drag it was
  (0.5% of the range a pixel); on its ring it follows the hand round, a full 270° sweep
  being its whole travel. The two disagree about the same motion (up on the ring's right
  side is anticlockwise), so the knob decides once, at the hold. A double-click puts a knob
  or a desk slider back to the look's own value (`lookOf` of the open document, or of the
  built-in it came from); a rig setting such as the dimmer has none and stays. On a phone
  every knob is a touch slider, so Play's five setting sliders take a double tap instead.
- **8d** The desk drew every absolute CC as a fader, because a binding only says absolute or
  relative. `controlKindOf` names which CCs turn on the boards the factory maps are for (the
  APC40's device and track knobs and its two encoders, the Launch Control XL's three rows,
  the nanoKONTROL2's eight), from the map's device or else the port; an unknown board keeps
  today's rule.
- **8e** Load-in's Wall panel (and the Stage sheet's) has a Test pattern switch and Identify,
  and Output gain and Gamma as 56 px knobs. The pattern is drawn in the projector's own pass,
  so it goes through the same corner pin, flip and blanking as the show: per quad a grid kept
  square by the quad's shape on the wall, both diagonals, a circle 0.8 of the height across,
  a white border, the corners numbered 1 to 4 clockwise from the top left as the pin's
  handles are, and the quad's number in the middle (a mapped shape's place in the Mapping
  list). Identify flashes each quad's number, half the height tall, for three seconds over
  whatever is up. Neither is ever stored with the output config (a show reopened on a test
  pattern would put a grid in front of the room); App keeps it beside the config and lays it
  on for the plate and the cast state, so a receiver drawing its own plate shows it too.
  The design puts the switch in Load-in's plate bar; the bar is one bar in every layout
  (`npm run panel`), so that is 8e-2.
- **8f** The Phone · iPad panel draws its link as a QR code: an encoder written here (byte
  mode, level M, versions 1–10, the eight masks scored by the standard's penalty rules),
  drawn as one SVG path in whole pixels per module, black on white with its quiet zone.
- **8f-1** The Phone · iPad panel's code whenever nothing is linked, and Link another while phones are (2026-10-11; check `npm run phonelink`). On the hosted site the panel had said "No phone linked." over three lines of words and no code. The desk never knew whether a phone was linked: `status.phone` was the display's own socket to the relay, so with the Mac app up and no phone in the room the panel said "A phone is linked and driving the show" and the footer "phone linked". The relay (`server/remote-server.js`) now counts phones (`controllers`) for the display as it counts network displays (`mirrors`), and gives a display the count on its hello; the desk counts them, puts the code away while one is on, and a Link another button brings it back. With no show server behind the page the code is the page's own address (`/`), which opens the show on the phone itself, and the words say how to get a show server.
- **8h** The header at 1024 measured 342 px of cluster against 337 of room right of the
  centred switch, so the Sound dot sat 5 px under it. The header now has three measured
  levels: the dots' words beside them, under them (12 px from the switch, as before), and
  folded into one Status button (only when the cluster actually reaches the switch), whose
  dot is red while recording and green while anything is connected, and which opens every
  dot as it was. At 1024 the folded cluster is 73 px clear. Where the dots unfold depends on the
  fonts: 1280 keeps every dot in sight in a cloud session, CI's Linux runner folds there and
  unfolds by 1440, so the check finds the width rather than assuming it.

Measured (cloud): `desk` 27 → 40 (8c's ring arithmetic, 8d's four boards and an unknown one
as the control); `qr` 13/13 new (every symbol read back from its modules: format and
version words against their BCH codes, every Reed–Solomon block's syndromes zero, the bytes;
three flipped modules make 35 syndromes non-zero, the control), and all eight cases decoded
by OpenCV's reader in the session; `wallpattern` 20/20 new under `PW_WEBGPU=1` (on CI's open shard) (off is the
pass byte for byte; on, the grid, cross, border, circle and corner digits where they should
be, following a pulled pin, swapped by a flip, under a mask, one number per mapped shape,
Identify over the show, ungraded); `map` 44 → 47 (a config saved with the pattern up is stored without it); `layout` 58 → 68 (a knob turned round its
ring 0.113 → 0.779, a cap drag sideways leaves it, a double-click back to the look's 0.313;
the Wall panel's four controls and the pattern never stored; the QR drawn module for module;
the header clear of the switch at 1024 with a seventh dot in it, folding and unfolding where
the dots fit, and a take's Rec dot folding a full header and unfolding it when the take stops; the "every status dot is labelled" check opens the fold and counts the five dots inside
it, not the one button); `phone` 369/369 with Play's double tap back to the look's speed; `panel` 180/180; `wgsl`;
`desklayout` 40/40.

**8i, shipped 2026-10-10: fewer panels, each usable at any size.** Three asks from the
owner in one evening, with screenshots. *No setting alone on a panel*: a knobs panel draws
the numbers of its section, so Sound Mappings (Sound Drive and four band pickers) was a
panel of one knob and Heat Slide one of two. Sound Mappings went into Sound (Sound Drive
first, the bands under "What the sound moves"), where Room Drive and Film Drive already
sit with their sources; Heat Slide went into Fluid Physics beside Heat Spread and
Buoyancy. `MERGED_SECTIONS` in `settingsMap.ts` sends the old ids on: a saved layout
naming them opens the merged panel in the same place (`sanitizeLayout`), and
`openSettingsAt` follows them. Build's deck has Sound where Sound Mappings was. MIDI maps
and presets name settings, not sections, so nothing in them moved. *Fade and Go
smaller*: the strip under the cue list went from 140px to 68px (a fade row that fills the
column, so 8s no longer ran past it, and a 36px Go); Back and Freeze are off it, and
stay on ⌫ and F, ⌘K, and their MIDI actions. *Panels as windows resize*: the frame
clips its rounded corners, and the Dyes body did not scroll, so on Gig's 236px deck
Palette, Image and Video were out of reach; and the palette list opened below its button
whatever was there. Every panel body now scrolls (never sideways), the swatch grid fits
as many 28px swatches a row as there is room for, the palette list opens over its button
when there is no room under it and is never taller than the window, and the Sound
section's source switch and the Video section's source buttons narrow or wrap to a
312px panel. Measured: `desklayout` 40/45 on main → 45/45 (no knobs panel under three,
the old ids landing on the merged panels, never twice); `layout`'s new reach check
(every control in every panel, scrolled into view only by what a hand can scroll, then
hit with a pointer: the three shipped layouts at 1024, 1280, 1440, 1920 and an iPad's
1180, every panel in the deck, in a column and floating) is red on main (Gig's Dyes
panel: Image and Video out of reach, and the palette list 667–1087px in a 700px window;
Load-in's Sound: Band cut off) and 4,162 controls in 255 panels over 23 desks reachable
after. `layout` 72 → 73. It takes the run from about one minute to under three.

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
  window, and that the magnet let go of has strength. Left then: a hold while the show
  was frozen or draining gave no magnet, because the hand is read in magnetFor, which
  only the solver's step asked; a hold after Start did. Shipped 2026-10-05: frozen
  or draining, magnetFor is asked for its bookkeeping alone whenever a hand has the
  magnet (the step's settings thrown away, so a frozen plate still does not move),
  and the drain, which skips every hand, still notes where the magnet's hand is.
  `npm run magnet`'s check 9 freezes Classic (F), holds the Magnet in a corner,
  lets go, and asks that the solver was not stepped through the hold, that the look
  was given Magnet Strength 0.8, and that thawed the solver has it where the hand
  left it The drain's path has no check of its own: a drain is under a
  second, and a hold timed into it from a harness would be a check of the timing.

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

8. **Evolve changes slowly with the song** (2026-10-11). The owner: "I want evolve to
   focus on more slowly changing settings (as opposed to directly reacting to frequency
   and bouncing around). It should consider the music in longer changing ways, and
   slowly changes the visuals in creative and interesting ways. If there is no music,
   it can do basically the same thing and slowly change across time."

   What it was: every six seconds two unrelated dials picked at random, each glided over
   four seconds (`driftLook`), with no ear at all; the hands (a drop or a puff about
   every seven seconds) sized each drop by the frame's energy, heated it by the frame's
   treble and chose drop or air by the frame's spectral centroid; the palette re-rolled
   on a one-in-ten-thousand chance every frame; the closeup's aim jumped ±0.12 over four
   seconds every twelve; under Evolve the plate's pace heard eight seconds of loudness and
   slewed over three. And `DRIFTABLE` let it drift Plate Rock, Beat Squeeze, the
   kaleidoscope's spin and the turntable on a look that had them.

   What it is (`src/lib/slowEvolve.ts`, `src/lib/drift.ts`): one move at a time, a few
   dials from one theme (flow, dye, surface, heat, glass, chemistry, ferrofluid, film)
   going the same way, glided over 30–90 s, then a rest. Which way is a lean from the
   song shape tracker's intensity averaged over 30 s against the song's own 4-minute
   level, pushed livelier through a build and for 30 s after a drop, calmer through a
   breakdown; a section change during a rest starts the next move. The palette turns at
   a drop or a breakdown (at most every 75 s), for the dye still to come
   (`evolvePalette` on the visualizer's handle). With no music the lean is an
   Ornstein–Uhlenbeck walk on three minutes and the palette turns every 3–5 minutes.
   The hands hear the 30 s level and the section (a build reaches for the air, a
   breakdown halves them), never the frame. The pace hears 30 s and slews over 20 under
   Evolve. The aim moves ±0.08 over a whole move. `FRAME_MOTION` holds every
   frame-moving dial out.

   Measured (`npm run slowevolve`, Classic, default Evolve Speed), before → after:
   moves started 10/min → 0.7/min with a song, 0.6/min without, each followed by a rest
   of at least 6 s; glide 4 s → 57–81 s; fastest dial 0.78 → 0.13 %/s of its travel;
   the aim's fastest 45 → 2.5 thousandths of the plate a second (at full speed); change
   over 1 min 0.37 → 0.31 % and over 10 min 1.21 → 1.37 % (RMS of the dials' travel),
   so about the same amount of change, made as one slow move instead of twenty
   twitches; the lean 0.57 after drops and −0.13 in breakdowns (it heard nothing
   before); a level shaken ±0.3 every half second leans within 0.04 of the steady song.
   Review found a glide carrying the old look's dials into a new one (a look laid,
   opened, faded to or taken back now stops the move) and cues kept through a glide
   starting the next move with no rest; both fixed and checked.

   **8d. The Evolve Speed dial sets the pace.** The owner, once the slow Evolve was
   live: "I want evolve to go really slowly if the settings control is low - but if I
   ramp it up, I want it to evolve quickly." The dial barely touched the pace: every
   glide was held to 30–90 s whatever it said, and it shortened the rest and the glide
   by a fifth or so. Now `evolvePace` stretches every time in the planner (the glides,
   the rests, the palette's least gap) by up to four at the bottom of the dial and
   shrinks it by up to eight at the top, log-even on each side of the look's own Evolve
   Speed, so every look plays exactly as it did until the dial is turned. Measured from
   one fixed middle (0.12), review found 14 of the 41 looks, which set their own from
   0.02 to 0.3 for the hands' pours as much as for this, would have slowed by 1.5 to
   3.5 times untouched. The rest is counted on the dial as it is now, so a turn up in
   the middle of a five-minute rest is answered in seconds; it is never under 2 s. The
   palette never turns twice in 20 s, and the closeup's aim never moves faster than at
   the look's pace (a fast move is a shorter step of the aim): the liquids may hurry,
   the frame may not.

   Measured (`npm run slowevolve`, Classic, a song, half an hour at each), before →
   after, moves a minute and mean glide: 2% 0.63, 66 s → 0.20, 217 s; 5% 0.63, 66 s →
   0.27, 156 s; Classic's own 15% 0.67, 64 s → 0.67, 64 s; 30% 0.70, 62 s → 0.93,
   44 s; 60% 0.83, 56 s → 1.87, 21 s; 100% 1.10, 48 s → 4.87, 8 s. Each of the four
   looks the check plays, at its own Evolve Speed, still 0.6 to 0.7 moves a minute of
   30–90 s glides. Turned from 2% to full in a rest, the next move came 2 s later (left
   at 2%, 62 s). With a drop every 6 s at full, the palette turned 9 times in four
   minutes, 24 s apart at the closest. The aim at full: 2.1 thousandths of the plate
   a second (the bar is 4).

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

**Shipped, the MIDI fader's half (2026-10-11).** A fader handed React every move on an
animation frame (`rideSetting`), and the MIDI hook set its "last event" state twelve
times a second and its clock lamp twice a second whatever it held, so with one fader
swept at sixty messages a second (`npm run renders`, a stubbed controller on CC 7 bound
to the Dimmer) the App rendered 121 times a second, laptop and phone, and at rest with
MIDI on twice a second, against the desk clock's once. Now the plate reads the ride
itself at the top of every frame (`ride` on `LiquidVisualizer`, `SettingRide.lay`), put
where every reader in the frame loop reads, and React is handed the ride every 100 ms
(`RIDE_VIEW_MS`), for the desk's number; the last event is a store only the MIDI panel
and the on-screen controller subscribe to (`useMidiLastEvent`), and the lamp is set only
when it changes. Measured: the desk's Dimmer changes 9.7 to 10.3 times a second (59.9 before),
the App renders 11.0 a second, commits the same (121 before), where the fader stops is
where the Dimmer lands, and a second after letting go the App renders its clock alone,
1.0 a second (2.0 before). #348 had tried the split and taken it back for three faults,
each answered: `lay` lays a key only while what React rendered disagrees with it, so
once React has a move no frame copies anything (`npm run panel`: 0 of 3600 frames,
where the first try copied all 3600); App's `ridePlate` keeps the ride off a key the
identified track overrides, and off the wall's non-room keys while the desk builds on a
copy; and the frame puts the result in the one `settingsRef` the whole loop reads. On
the Mac `renders` also holds that at least half the frames during the sweep draw a move
React has not rendered yet, and that none does once the fader is let go. The same PR
treats a ride as a hand's write for Evolve (14t): a glide on the dial is dropped at the
first message, the drift's anchor moves to where the fader put it, and the drift skips a
dial a fader holds that React has not rendered yet. On the Mac (#360's run) the plate's
Dimmer moved 33 to 38 times a second on the laptop page against the desk's 8, and 19 to
21 on the phone page drawing 20 frames a second, with 86 to 94% of frames laying the ride;
none once let go. The same run found the desk at 7.0 to 7.3 a second on the phone page:
the flush was timed from the last flush, so each late timer and each wait for the next
message lengthened the period. It is stepped on the ear's schedule now. Found in review and fixed in the
same PR: a receiver that draws its own plate (a Chromecast, a mirror) is sent the state
with the ride laid over it, and a ride asks the cast's throttle for a send, so it still
hears a fader at the cast's 15 a second rather than React's 10; a preset, a Go or a desk
slider landing within the tenth of a second before a flush hands React the ride first
(`flushRide`), so the newer write wins as it did when the window was a frame; a look fade
starts from where the fader has the plate, not where React last heard it; and the MIDI
panel's activity light renders itself out 400 ms after the last message, which the App's
renders used to do for it.

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
- **Shipped, 14v-5: the intro starts still, and turns once the opening's render
  pipelines are built** (PR #335, 2026-10-10). What was reported: `npm run
  startup`'s "no stop in the opening" went red on about half of 10-10's Mac runs,
  across PRs that never touched the opening (2.17 s, 2.57 s against the 2 s bar), and
  held up deploys. What was measured: over the open shard's 176 runs from 27 September
  (`ci-flakes/startup-intro/open-shard-runs.txt` in the project's files), the show's
  longest wait for a frame was a median 0.53 s (p90 0.78 s) on the 57 runs before the
  intro merged (#274, 10-04 20:13 UTC) and 1.73 s (p90 2.20 s, 19 of 119 over 2 s) on
  every run since; the GPU device went from a median 0.09 s to be given to 1.63 s in
  the same hour. The stops lay inside the device request with the intro turning, or
  in the first compile after it. Holding it still around the render compiles (14v-4)
  had caught the second and not the first, and taking out the pools' blend mode
  neither. PR #335's first push opened the show three times each way on CI's Mac,
  cold: as shipped 2.35, 2.13, 2.32 s; without the intro 0.47, 0.47, 0.82 s; without
  its colour pools but turning 1.93, 2.33, 2.17 s; still from the first paint 1.18,
  0.85, 0.92 s. So it is the motion, not what moves: a turning picture is a new frame
  every refresh for the compositor to present through the GPU process, which on a
  cold Mac is busy starting the device and compiling, and each frame waits there.
  The fix: `index.html` starts `#cg-intro` with `.cg-still`, `installIntro` records
  the hold from 0, and `Quiet`'s `go` lets it turn once the opening's render
  pipelines are built, as before. `npm run intro` line 9b holds every frame from the
  first to the last render compile still, with some seen before the first compile
  was asked (SwiftShader: 328 frames, none moving, 86 before the first ask at 2.27 s;
  with the markup's `.cg-still` taken out, 83 of 85 moving before the first ask and
  the line red).
- **Shipped, 14v-6: the opening asks its first fills before the display, after the
  mount frames settle** (2026-10-18, this PR). Over 2026-10-11 to 18 (`npm run
  flakes -- --check 'no stop in the opening'`), `startup`'s "no stop in the opening"
  went red on 26 of 167 Mac runs (16%; 11 of the 26 green on the same commit). PR #396
  tried warming the compiler at
  boot (an empty kernel, a built fill-shaped kernel, and that kernel run once) and
  went red on all three Mac runs of its own PR; its third run showed that the stop is
  not Metal's compiler starting (the warm started it in 0.13–0.20 s), but the
  opening's own `fluid/fill:rgba32float` compiling 4.32 s from 2.64 s beside
  `plate/display` (2.64 s) while a frame asked at 3.42 s waited for the GPU process
  until 6.80 s. This PR's first version (fills first, display held until they settle)
  still went red on its own first Mac run (39189617869): fills asked at 2.42 s,
  `fluid/fill` 2.67 s, a frame gap of 2.07 s from 2.59 s, with a long animation frame
  that began at 2.61 s and did not render until 4.74 s, and the page's frames
  numbering 8 at 2.25 s and 11 at 2.82 s, so the desk's mount frames were still being
  presented when the fills were asked. Three changes (`src/hooks/usePreviewFrame.ts`,
  `src/lib/intro.ts`, `src/gpu/prepare.ts`):
  - `usePreviewFrame` measures the desk's preview hole in `useLayoutEffect` instead of
    `useEffect`, so `plate-frame` and `#cg-intro` mount directly in the preview
    rectangle on `App`'s first paint instead of painting full-window and resizing on
    the next frame.
  - `introStill()` waits four animation frames plus a macrotask (with a 1.5 s safety
    cap for a tab hidden mid-wait, and resolving at once if already hidden) even when
    `#cg-intro` already has `.cg-still` from `index.html`. On run 39189617869, a 200 ms
    cap fired at 2.42 s before the first post-mount frame at 2.50 s had rendered,
    leaving frames at 2.50–2.59 s to wait 2.07 s on `fluid/fill`.
  - `prepareShow` ranks the three `fluid/fill:*` compute kernels ahead of
    `plate/display` and holds `plate/display` (and the remaining kernels) in
    `buildInTurn` until the opening's `fluid/fill:*` kernels are given (`fillLeft`),
    then asks `plate/display` alongside the remaining compute kernels.
  Not reproduced locally: the Mac's compiled-shader cache is warm there (the opening
  took 0.24 s), so `npm run startup`'s "no stop in the opening" passed on the warm
  cache and proves nothing about the cold stall; emptying that cache
  (`STARTUP_COLD=1`) is the owner's to allow, and CI's cold runner is the judge. On
  the Mac: `npm run intro` 13/13, `npm run loadtime` 4/4, `npm run lint`. Judged over
  the week after merge against the week before by `npm run flakes -- --check 'no stop
  in the opening'`.
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
  ### 14n. One malformed message can end the plate

**Shipped** (#322): one `sanitizePatch` against the settings registry for the socket, MIDI map loader and loaded looks; gestures dropped if non-finite; `hexCache` bounded with 512-entry eviction; verified with `npm run sanitize` and `npm run remotemix`.

**Read in the code; the chain was followed by hand, not run.** The display applies a
remote `patch` as it comes (`case 'patch': queuePatch(message.settings)` →
`updateSettings`, `App.tsx`): any key, of any type. `{"simResolution":"x"}` gives
`Math.round("x")`, `NaN`, in `resolveSimResolution` (`LiquidVisualizer.tsx`); `new
WebGPUFluid(device, NaN)` throws on `createTexture`, and the catch calls
`governor.failRung()`, which marks the rung failed forever (`governor.ts`). Each rung in
turn fails the same way, until the plate stands on "no WebGPU": a one-way door in the
sense of `docs/stability-plan.md`. A phone on an older build that sends a renamed or
retyped key does the same by accident. The OSC path already drops non-finite numbers
(`oscToMessage`'s `num()`); the socket does not. Two more doors of the kind:

- a MIDI map file's setting binding keeps any key and, for a key not in
  `LEARNABLE_BY_KEY`, its own `min` and `max` unchecked (`parseMidiMap`, `midi.ts`),
  where `parseSoundBindings` drops unknown keys;
- gestures: `dx`/`dy` sent as strings become `NaN` in the CPU velocity
  (`blowDirected`), and every distinct `drop.color` string becomes a key in `hexCache`
  (`constants.ts`), which never forgets one.

*Fix:* one `sanitizePatch` against the settings registry (known keys, the default's
`typeof`, finite numbers clamped to the setting's range), used by the socket, the MIDI
map loader and a loaded look alike; gestures typed as OSC's are; `hexCache` bounded.
*Measure:* a node check beside `npm run remotemix` that sends `simResolution: "x"`, a
`NaN`, an unknown key and a 1,000-character colour, and finds the settings, the
governor's ladder and the cache as they were.

#### 14v-7. A frame gap while the intro is held still counts only the page's own work

Shipped 2026-10-24, the owner's choice on a card ("judge pauses the audience sees").
`npm run startup`'s "no stop in the opening" was the loudest check on CI: 41 FAIL of 193
Mac runs in the week to 10-24 (`npm run flakes`), 25 branches, 4 of them main's, 20 green
on the same commit; the week before 14v-6 it was 16%. Every one of the 41 logs read:

- the longest frame gap 2.02 to 3.97 s, beginning 0.24 to 4.08 s in;
- inside Chromium's own waits: the device given up to 3.7 s after it was asked, or the
  first compute kernel of all (`fluid/fill`, a few lines) given 2.4 to 4.6 s after;
- the page's own long tasks in the gap 0.83 s at most, none in 38 of them, and nothing
  made, written or submitted in it;
- every gap over before the intro let go of its still (4.64 to 11.96 s), the stretch
  `introStill` (14v-5) holds the mark still exactly because the GPU stops the frames then.

4b already took out the time the page's thread was held as well; in these the thread ran
and only the frames stopped. Two fixes on the app's side had failed (#396 warmed the
compiler, 14v-6 reordered the asks), and nothing a page does makes Chromium give it a
device sooner. So, in `openingGaps`, a frame gap that would count past the bar loses,
inside the still stretch, the time the page was seen free: between two ticks of its own
100 ms timer no more than `TICK_FREE_MS` (250 ms) apart. At most `STILL_IDLE_CAP_S`
(4.5 s, above the 41 gaps' 3.97 s and Chromium's start's 4.18 s) comes out all told, only
of a still that let go (capped at the intro's leaving), and only when long tasks and the
timer can be seen at all. Outside the still stretch, and for heartbeats and steps,
nothing changed, and the 2 s bar did not move. The line prints how much of its gap was
the still intro with the page seen free.

The first draft took out everything but the page's long tasks and pagehold's after-await
stretches. The check-skeptic fed it synthetic openings: 2.5 s of the page's code after a
pipeline's promise at 3.5 s, or a chain of 0.45 s continuations, read as idle, since such
code is not a long task in every Chromium and pagehold's stretches begin only in the first
3 s; a still that never let go excused everything up to the intro's 60 s cap. The timer
answers all three, and `stillCases` now runs six such openings on every run (excused,
code after an await, a continuation chain, a gap across the still's end, a still never let
go, the cap), each of which a mutant of the rule turns red. Replayed on the 41 logs by
their printed long tasks: 0 red; the timer's ticks inside the gaps are not printed (its
median was 108 to 118 ms in all 41), so the week after, by `npm run flakes`, decides. The
new count is never more than the old, so no green run turns red.

Named limit: a stop the GPU process makes for the page while the intro is still (its
compiles of the app's shaders) is no longer counted here; its length is held by checks 1
and 1b and the first step's cap. Weighed and not taken: one automatic re-run (about 4%
red instead of 21%, and it hides a real one-in-five), warming Chromium's GPU in a page
before the measured one (untested, and #396's warm in the same page did not help).
- **Shipped, 14v-9: the webpage loads only itself first, and leaves the GPU for Play**
  (2026-10-28, asked by the owner the same day: "speed up the first load"). Measured
  against the live site from a cloud browser: chromaglass.art fetched 811 kB, 590 kB of
  it the show's own chunks (App, castProtocol and four more, preloaded by the page for a
  show the visitor had not opened), while the webpage's own chunk (4 kB) was asked only
  once the entry had arrived and run, at 1.40 s, and its pictures at 1.67 s; and
  `main.tsx` asked for the GPU at once, whose start holds the page's thread (0.6 to
  4.5 s on CI's Mac, `npm run startup`'s "held" line) while a visitor reads. Now the
  page's preload script (vite.config.ts) tells the webpage's address the way
  `landingFirst` does and preloads the webpage's chunk there; `main.tsx` asks for the
  app once the webpage's eager pictures are in (4 s at most) and for the GPU when a
  pointer or the keyboard reaches Play, or at Play itself. `npm run loadtime` 4a to 4d,
  on a second build with a demo sign-in (on today's code 4a, 4b and 4c are red; on a
  10 Mb/s, 100 ms line the first picture is in at 0.46 s, from 0.83 s). Also: the
  webpage's pictures, the intro's drawings and `/video/` were served `no-store`, so
  every visit fetched them again; they are now cached for an hour (firebase.json).
  Named cost: a visitor who presses Play without the pointer resting on it first waits
  for Chromium's GPU start (1.8 to 4.3 s cold on CI's Mac) inside the intro, where
  before the webpage had paid it while being read.

### 14m. Anyone on the venue's network can drive the show

**Shipped** (this PR). What changed, in `server/remote-server.js` unless named:

- The show key is eight digits from `crypto.randomInt`, compared with `timingSafeEqual`,
  kept in `server/.show-key` (mode 600, ignored by git) so a restart keeps it, and the
  Mac app's key is eight digits too (`desktop/main.js`; a four-digit key is replaced, so
  each phone scans the new code once).
- Only the laptop is handed a key: `/remote-info.json` answers `key` and `displayKey`
  to a loopback socket with a localhost Host and no forwarding headers. The display has
  its own 32-hex key, new each launch, so a phone's key cannot take the display role.
- Three wrong keys from an address, each within 5 minutes of the last, lock it out for
  5 minutes (`denied` with `reason: 'locked'`, which the phone shows and waits out); a
  good key no longer clears the count, so a guest's own join cannot reset a guesser on a
  shared address. Past 30 wrong keys a minute across all addresses, new joins from all
  but the laptop are refused for 60 s, so a guesser spread over a /48 of IPv6 needs
  years (PLAN 14m-budget). A display hello with no key is not a guess and is not counted,
  and the laptop's page at its Wi-Fi address, which is given no display key, no longer
  knocks. At most 4 sockets per address may be open without having said hello. The
  upgrade checks Origin (none, from
  the native apps and the checks; a page this server served; the iPhone app; a page on
  this machine); `maxPayload` is 512 KiB (close 1009); a socket
  has 5 s to say hello; 16 sockets per address and 200 in all.
- `useRemoteLink.ts`: a relay that was there and went away is looked for on the short
  backoff, not the 30 s probe, so a laptop and phone come back after a restart by
  themselves; a frame over the cap is dropped with a warning rather than sent.
- Art-Net: an input universe (`artnetInUniverse`) and the `ARTNET_*` numbers falling
  back to their defaults when they are not numbers (`npm run lights`, 30 of 30).

*Measured:* `npm run showkey` on the old server 11 of 33, now 33 of 33. With the server
down for 4 s under a linked phone and laptop, a change on the laptop had not reached
the phone in 25 s before; now it does in 3.6 s. `applink`, `draw`, `drawwall` read the
display's key from `/remote-info.json`, and `remotemix`, `phonelink`, `panel` pass.


**Read in the code** (`server/remote-server.js` unless named).

- The show key is four random digits (`SHOW_KEY`), about 13 bits, compared with `!==`,
  and a wrong `hello` only closes that socket: nothing counts failures or slows the next
  try. Through `npm run tunnel` the 9,000 keys fall in minutes.
- On the LAN it need not be guessed. `/remote-info.json` hands the key to any request
  without `x-forwarded-for` or `cf-connecting-ip` (`isLocalRequest`), which is every
  device on the venue's Wi-Fi, not only the machine `remoteProtocol.ts` says it is for.
  The socket checks no Origin or Host either, so a web page open on any phone in the
  room can reach `ws://<laptop>:3000/remote-ws`.
- With the key, a `hello` as `display` receives every phone's commands, and can push
  `state` and `cast` to the phones and to the network display on the wall, set the
  Art-Net `lights`, and toggle Record and Blackout.
- Frames are taken up to the `ws` default of 100 MiB (`new WebSocketServer({ server,
  path })`); the 512 KB limit is checked after the frame is buffered and made a string.
  A socket that never says hello is never closed, and nothing caps connections. A few
  large frames stop the Node process, and every phone, network display, OSC and Art-Net
  with it.
- A restart with the generated key answers every phone and network display `denied`,
  and `useRemoteLink.ts` stops retrying for good on that, though the server's comment
  says it is restartable mid-show.
- Art-Net in reads every universe but its own output (`packet.universe ===
  artnet.universe` is the only filter) into one `seen` map, so on a rig with four
  universes each mapped setting jumps between their values. A non-numeric `ARTNET_RATE`
  makes the rate `NaN`, and `setInterval(…, NaN)` sends every millisecond.

*Fix:* the key only to a loopback `req.socket.remoteAddress`, and an Origin check on the
upgrade; a longer key from `crypto.randomInt`, compared with `timingSafeEqual`, and an
address locked out after a few wrong hellos; a display key apart from the phones', so a
phone's key cannot take the display role; `maxPayload: 512 * 1024`, a 5 s deadline for
the hello and a cap per address; the generated key kept in a file beside the server, so
a restart keeps it; an input universe, and the `ARTNET_*` numbers validated. The phone's
join and the iPhone app's laptop remote (`appLink.ts`) must keep working.

Once the server has roles, a **guest key** is a small step (*proposed*): a key whose
socket may only drop, blow and finger, rate-limited, in the palette's dyes, onto a
chosen plate, with a Guests level and a kill on the desk and the phone. A singer's
tablet, a second projectionist, or at a party the audience's phones through a QR code
on a card.

*Measure:* extend `npm run remotemix`: a request from a LAN address gets no key; three
wrong keys lock the address out; a 1 MB frame is refused without the process growing; a
silent socket is closed at 5 s; a restart keeps the key and the phone rejoins; a guest
socket's `patch` is dropped.

### 14m-mark. A big logo never reached the network display

**Shipped** (the PR after #391). 14m made the relay close a socket on a frame over 512 KB
and the desk's link drop any message that large, and the mark crosses the relay as a data
URL, once, when a network display joins: a print-sized PNG logo is several megabytes, so
after 14m the network display showed no logo. The cap stays (it is what keeps the relay
from holding a stranger's megabytes); the desk sends the network display a copy that fits
(`src/lib/markFit.ts`): a mark under 400 KB goes byte for byte as before, a larger one is
redrawn at most 1920 px on its long side as WebP (which keeps transparency; JPEG would
paint the clear parts black) and shrunk in steps until it fits. Safari writes no WebP from
a canvas and falls back to PNG, which keeps transparency too. The laptop's plate and a cast
window on the same machine keep the original. `npm run phonelink`: a 2.2 MB PNG with a
clear border reaches a mirror socket as a 287 KB WebP at 700×700, border alpha 0 and centre
255; a mirror joining afterwards is handed the same mark (the desk's link survived); a
48-pixel logo crosses byte for byte. On the code before it: no mark reaches either mirror.

### 14m-lan. The laptop's page at its Wi-Fi address

**Shipped** (with 14m-mark). The plan said the page would sit quiet with no display key;
measured, it never got that far: a browser gives WebGPU only to a secure page, and
`http://<laptop-ip>:3000/` is not one, so the page stopped at the first shader module with
"GPUTextureUsage is not defined" and nothing else. The failure screen (`src/main.tsx`) now
says why, and links `http://localhost:<port>/` on the same port; a network display
(`?cast=true`) is told why and is not sent to its own localhost, which is not the laptop
(the network display's own problem is PLAN 14m-https). In a browser told to treat the
address as secure, the Phone · iPad panel says to open the page at localhost and draws no
code: it used to draw one of the remote with no key in it, which a phone could scan and
never join with. `npm run phonelink` asks all of it, with a WebSocket count that must see
the localhost desk's socket so that "opens no socket" cannot pass by counting nothing:
29 of 36 on the code before, 36 of 36 now.

### 14o. The song-ID Worker is open to anyone

**Shipped** (with 14m). `server/fingerprint-worker.js` now, before anything costs: an
Origin from the site, a localhost, the show server on a private address or the iPhone
app (403 otherwise, and for none); its counter store bound (503); a `Content-Length` of
at most 2 MB read before `formData()` (411 / 413), and the file measured again after;
30 an hour per address, per /64 on IPv6 (429); 1000 a day across everyone, or
`FINGERPRINT_DAILY_LIMIT` (503 `busy`), and a counter store that throws is `busy` too,
with CORS, not a bare 500. The app reads any refusal as no match.
`wrangler.toml` binds `FINGERPRINT_LIMITS`, which the owner creates before redeploying.
*Measured:* `npm run fingerprint-worker`, 7 of 19 on the old Worker, now 19 of 19; each
refusal also shows the service was not called.


**Read in the code.** `server/fingerprint-worker.js` answers any origin
(`Access-Control-Allow-Origin: *`) with no key and no rate limit, and its URL is built
into the public bundle (`VITE_FINGERPRINT_PROXY_URL`, `deploy.yml`). Anyone who reads
the bundle can identify songs on the owner's AudD or ACRCloud account, from a script or
from their own site. It also parses the whole multipart body (`request.formData()`)
before its 2 MB check. The report Worker already has what this one lacks
(`ALLOWED_ORIGINS`, a per-address limit in KV; `docs/crash-plan.md`).

*Fix:* the same origin list and per-address limit (per /64 on IPv6), a refusal on
`Content-Length` before parsing, and a daily ceiling that answers "busy" rather than
spending. The show's own origins (the site, the show server, the Mac app) stay allowed.
*Measure:* a node harness in the manner of `npm run report-worker`: a foreign origin
refused, the 31st request in an hour refused, a 3 MB body refused before `formData()`.

### 14s. The ear: the input picker (shipped)

**Shipped 2026-10-05.** `chooseAudioInput` (`App.tsx`) was memoised on `[audioSource]`
alone and called the `handleSourceChange` of the render in which the source last
changed, when `audioStream` was still `null` and `audioInputId` the old one. Measured
2026-09-28 with Chromium's fake devices, and again by `npm run inputpick` on main
before the fix: picking Input 1 and then Input 2 made three `getUserMedia` calls, none
with a `deviceId`, and all three tracks stayed live ("3 live tracks: default, default,
default", 2/5). The interface picked at soundcheck was not the one the show heard until
a reload, and each pick left another microphone open. Now the stream and the input are
refs beside their state, the picker calls this render's handler through a ref with the
id it was given, and a device that answers after a newer pick is closed rather than
heard. `npm run inputpick` goes through the desk's Mic dot and the settings' list: each
pick asks for its own input by id, one track is live at the end, Input 2's (5/5). It
runs in Measure's browser part. Safari's second song and song ID's latch stay open in
PLAN.md 14s.

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


### 14ad. Any camera, anywhere; the motion camera told apart from the film's Webcam (shipped 2026-10-24)

Asked by the owner: "I should be able to select any camera as a source any place where we
use cameras in the settings. I'm also confused what the room control is vs. showing video on
the plate", and then, of the film's camera button: "this camera button only uses my laptop
camera".

What main did: two things open a camera. The room's sensor (`useSceneCamera`) had a picker,
drawn only once it was already on and only when the browser listed two cameras, so the
moment someone wants to choose, before the light comes on, it was not there. The film's
camera (`startFilmCamera`) asked for `facingMode: 'environment'` and nothing else, so on a
laptop it was the built-in camera, always; a second webcam, a capture card or a virtual
camera (the way a VJ app's output arrives today, §13) could not be put on the plate. A camera
pulled out left the sensor reading "opening…" and the film reading "camera live" over a dead
track, and neither came back.

What changed: `src/lib/cameras.ts` names the cameras and opens the chosen one by id, falling
back to the browser's pick (and saying so) when it is not plugged in; `useCameras` keeps one
list for both; `CameraPicker` is always drawn, with the remembered camera kept and marked
"not plugged in" rather than dropped. Both sources hear their track end, come off, say so,
and reopen when `devicechange` lists the same camera again. The sensor is renamed by what it
does, **Motion camera**, with a first line ("Its picture is never shown") and a link to the
film's Webcam, which has the opposite line and links back.

Measured (`npm run cameras`, two stand-in cameras behind `navigator.mediaDevices`): 31 of
31, desk and phone. The film opens `cam-usb` by id when picked (main could only ask for
`environment`), switches live, comes off on unplug and back on replug, and each camera's
choice survives a reload apart.

### 14ac. Cartoons that ship with the app, and the video pour's stutter (shipped 2026-10-24)

Asked by the owner 2026-10-24: early cartoons in the app to run in the background and feed
the visuals, The Skeleton Dance first, and then "I don't want a short loop, I want the
extended cartoon looped."

What shipped. Four cartoons, each the whole film with only its title and end cards cut:
The Skeleton Dance (1929, 5:08), Steamboat Willie (1928, 6:58), Swing You Sinners! (1930,
7:28) and Out of the Inkwell's The Tantalizing Fly (1919, 3:19). A Cartoons shelf on the
desk's Dye panel and in the phone's dye sheet gives each a Pour (into the dish as dye,
looping, with Stop) and a Film (through the projector, under the dye; pressed again, off).
They are not also in Settings' Film section: on the desk that section sits beside the Dye
panel, and `npm run layout` caught the same buttons drawn twice.

Copyright. Every one was published in 1930 or before, so it is in the US public domain
(95 years from publication at the most). Where each copy came from, what was cut, and the
caveats (Disney's trademarks in Mickey; later versions of the characters; that The
Skeleton Dance's only copies online come from a modern transfer, not a print scan; status
outside the US) are in `public/video/cartoons/SOURCES.md`. Steamboat Willie is a scan of
an old 16mm print, cropped to the picture (its frame lines measured at rows 47 and 430 and
its edges at columns 60 and 538 on every tenth second of the reel). Swing You Sinners! is a
1950s television print whose distributor's title cards are cut.

Size. Silent H.264 MP4, 384 px wide, grey, 24 fps, grain smoothed (hqdn3d) before
encoding, the index at the front so a cartoon plays while it arrives: 6.1, 5.5, 8.1 and
1.5 MB, 21.2 MB together. The first pass, 480 px with light smoothing, was 48 MB. Nothing
is fetched at load (the files are not under `/assets/`, so the service worker leaves them
alone), so 14v's load time is unchanged; a cartoon is given to the video by address, so it
starts before it has all arrived.

14ab-1, fixed with it. `App.tsx` handed the poured video to the plate on every animation
frame, and `pourVideo` paused whatever it held before taking the new one, which was the
same video: it was paused and played sixty times a second. Now `pourVideo` takes a video
once (the same one again only makes sure it plays) and the app calls it once, on play.
Measured by `npm run cartoons`'s pour line, on a phone page in Chromium: with the old pour
(the per-frame hand-over and the old `pourVideo` put back), the page closed under the pour
before its two seconds were up (the check's "the page lives through Pour and Film" red,
10/11); with the fix, 2.00 s of the cartoon played in two seconds, 0 pauses, a picture
range of 186 read back from it, 14/14.

The film survives a rebuild. The GL effect's cleanup stopped the film, and that cleanup
also runs when the plate is rebuilt (`glEpoch`: a lost device, a resolution change), so a
loop, the camera or a window went dark on the projector while the panel still said it was
playing. Found by `npm run cartoons` under software WebGPU (`PW_WEBGPU=1`), after its review
made it ask what the projector holds: a second and a half after Film the projector held no
film and the video had been reset (15/16). The film is now stopped only when the plate goes
away, in its own effect (16/16 there).

The check, after one review pass: besides the files and the licence record, it asks that
the video the plate holds as its pour (`__cgVideo` under `?debug`) is the cartoon that
played, and that the plate's frame loop read it where there is a plate (2–3 frames in two
seconds on software WebGPU); that each loops (sent half a second from its end, back at its
start 1.5 s later, no `ended`); and that Stop and Film-off pause that same element and the
plate and projector let go. It runs in CI's browser part.

Measured: `npm run cartoons` 16/16 (no GPU and `PW_WEBGPU=1`), `layout` 77/77, `phone`
357/357, `desk` 48/48, `panel` 197/197, `lint` clean.

**Colour (2026-10-27).** The owner: "the out of copyright cartoons we added are all black and
white - we need some color ones please." Five more, whole and looping, on the same shelf and the
phone's dye sheet, each with a `colour` flag in `lib/cartoons.ts` and a "colour" tag in its row:
*Fiddlesticks* (1930; two-colour), *Jack Frost* (1934) and *Balloon Land* (1935) (Ub Iwerks'
ComiColors, Cinecolor), *Somewhere in Dreamland* (1936; a Fleischer Color Classic) and *Gulliver's
Travels* (1939; the Fleischer feature in Technicolor, title and End cards cut, 74 minutes).
Finding free ones took the renewal records, not the dates: a film from 1931 on is free only if
nobody renewed it in its 28th year, and the Copyright Office's *Catalog of Copyright Entries*
(on the Internet Archive as text) showed nine of the 1933 to 1934 ComiColors *were* renewed
(Exclusive Pictures, 1961 to 1962), so those are not here, while Jack Frost, Balloon Land,
Somewhere in Dreamland and Gulliver's Travels have none. Fiddlesticks is free by date: renewed in
1959, which does not extend a 1930 film past 95 years. What was left off, and why, is in
`SOURCES.md`. The colour cost bits: 4.2 to 7.3 MB a short against 1.5 to 8.1 grey, and the feature
27 MB; the check's bars moved to match (a feature up to 30 MB, the shelf under 80). The pour
already lays each pixel's own colour, so no drawing code changed; `npm run cartoons` now decodes
each file in the browser and holds its flag to its picture (0.0 colourfulness for each grey one,
30 to 82 for the colour ones).

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

### 15g. Blow as air on a thin film: the moving wind (first part, shipped)

What was reported: Blow moved colour with a stand-in. A moving Blow added a disc of
velocity along the stroke and moved the colour, the oil and the ferrofluid by a take
from under the hand and a put a hop ahead (`blowDye`, `blowOil`, `blowCarry`), once a
dye reading. On a thin gap the disc is mostly the divergent part of a flow, which the
solve takes back out, so the carries were all that moved anything. The owner's rule
(build from the physics) made it a shortcut to replace.

What was built: the breath is laid as the air's tangential stress on the surface,
τ = ½ρ_air C_f U² (1.2 kg/m³, C_f 0.01 for a wall jet, U 8 m/s at the surface: about
0.38 Pa at the jet's middle, falling as (1 − (d/r)²)² to its edge, scaled by the tool's
Amount), in pascals on the CPU grid (`src/lib/breath.ts`, `layBreath`), uploaded beside
the hands (`applyDeltas`' `breath`) and added in `hsBody` as the speed it drives the
reference liquid to at the rest gap, τh₀/2μ_ref, over the gap in rest gaps, as Updraft's
draught is. `hsPrep` reads it as a body force, so the column's mean goes at τh/2μ: as the
depth, and slower in a thick liquid. `blowWind` and `blowPhase` lay it and return on a
thin gap when the wind moves, so neither the push nor any carry runs there; the app
counts those steps (`blowSteps.aired`), which `npm run tools` now asks for in place of
the carried colour.

Measured (`npm run airblow`, lab, software WebGPU, Classic's step on the app's grids),
first at 6 m/s (the 8 m/s numbers follow):
- held in one place, the liquid under the breath went 10.7 mm/s, 0.37 of τh₀/2μ
  (29 mm/s): a rigid film lets through about half of a disc of force, the rest being
  divergence; on a liquid ten times as thick, 0.101 as fast against 0.100 from its
  viscosity;
- half a second after the breath stopped, 0.31 mm/s, under twice the drag time's
  e^(−0.5/τ) of the speed it had (0.26);
- a pool drawn across as the pointer draws it moved +1.04% of the plate the wind's way
  out to the right and +1.11% out to the left (the carries: 1.06% in `npm run wind`),
  keeping all its colour (−0.00%); left alone +0.00%; the old push alone +0.02%;
- a pool of ferrofluid went +2.89% and a drop of oil +0.83% by the flow alone, none of
  either made or lost.

Found by the Mac's `npm run tools` on the PR: with the carries gone, the stroke out to the
left moved its pool −0.26% (+0.20% to beat) and the one to the right +0.51%. On that
runner the pointer's moves came about 120 ms apart, and in the gap between the direction's
150 ms hold and the straw's hold the wind was a puff, whose ring carry moved 80 to 106 of a
pool of 210 to 244 out round the hand, backwards near the pool's leading edge (inferred
from the counts the check prints: 3 to 4 puff carries a stroke, no directed one). The wind
now blows along the hand's last way until the hand is held (BLOW_STRAW_FRAMES).

Then the Mac's next run read the stroke out to the right +0.13% and to the left +1.15%:
the air at 6 m/s moved a pool about a third as far as the carries had (1.77%, 1.95% on
main), and a pre-existing pull to the left (PLAN 15g-7) outweighed it to the right. The
breath was set to a firm 8 m/s (0.38 Pa): in the lab the pool then moved +2.72% and
+2.82%, held 19.0 mm/s (0.37 of τh₀/2μ), thick 0.101 as fast, pressed to a third of the
gap 0.42 of its τh/2μ, ferrofluid +7.08%, oil +2.07%, nothing made or lost (5/5).

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

### 15e. The liquids' own forces on the GPU plate (the check, shipped 2026-10-27)

`npm run liquids` held soap, glycerine, milk and silicone to what each is for on a 96²
stand-in, and nothing held the solver the app draws, which has carried the liquids in two
textures of its own (`addLiquidDrop`, `liquidForces`) since they were ported. The stand-in
and its four scenes moved into `scripts/liquidStandIn.mjs` (liquids.mjs prints the same
lines to the digit, its ceiling and cost sections aside, which are random and timed), and
`npm run liquidsgpu` lays those scenes on the lab's GPU solver on the thin gap the looks
use, the stand-in's pools cell for cell at its 96-cell logical grid. Two runs of a scene:
the deltas folded every step, and folded only on the pour's frame, as the app folds them
only on a frame something is laid in. A control (a stirred pool with no liquid, folded
every step and not) reads the same to the bit, so the fold itself moves nothing. What it
found is PLAN 15e-1 to 15e-9; the lines those items owe print as owed and fail the run
the day they pass.

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
- **18a-13, tilt sloshes the liquid (shipped 2026-10-20; the owner: tip it one way and
  then the other and the colour should slop and mix).**
  - Why nothing sloshed. The thin plate's drag is 12ν/h² with an open rim and no
    inertia, so a uniform tilt is cancelled by the surface's own slope the moment it is
    applied: the liquid has no momentum to carry past the new level and nothing to
    reflect. The tilt controls themselves (Gravity, Tilt Direction, the phone's Tilt and
    the remote's tilt) only ever fed the lean and the dye's fall.
  - What it is. A shallow-water dish on the CPU (`src/lib/slosh.ts`, `SloshDish`): 64² on
    a staggered grid inside a round rim that is a wall, mass kept, depth kept at 12% of
    rest at least, implicit linear friction at the gap's own rate (`sloshDrag`, 12ν/h²)
    with a quadratic breaking drag and a Froude speed wall at 0.8, upwind advection and
    substeps of at most 5 ms. Its flow is bilerped to the plate by `addSlosh`
    (`wgsl/fluid.ts`) and added to the thin solve's velocity after the solve, so the dye,
    the oil and the pressure all see it as a current. Fed only by the tilt
    (Gravity × Tilt Direction, the remote's tilt), wherever Gravity's value came from (a
    look, Evolve or a patch on it moves it too: PLAN 18a-13e): never by sound itself,
    Plate Rock, Frame Sway or the cover. The frame and the camera do not move.
  - The dial. **Slosh**, 0 to 1, default 0, on the sheet, the desks, MIDI, the remote and
    the phone's Play sheet; a hand-only dial (not a patch or scene target, and Evolve
    never moves the dial itself). At 0, and with no tilt, the dish is dormant at no cost and the plate
    is bit for bit what it was. At the top the lean is `SLOSH_LEAN` (0.01) of g, 0.49
    plate widths/s² at full Gravity: 0.02 blew the scheme up, so the pace is a stability
    limit and wants the owner's eyes.
  - Measured (`npm run slosh`, CPU, 24 lines): the lowest mode rings at 1.415 s over 16
    half-swings (theory 1.407 s); a held tilt settles to the slope a/g (0.3333 against
    0.3333 of rest depth per plate width) and comes to rest (4.8e-7 plate widths/s); the
    ring dies at e^(-rt/2) (0.300/s against 0.300/s); mass is conserved to 1e-7 and no
    cell dries under a worst-case resonant rocking at half-periods of 0.35, 0.5, 0.7 and
    1 s (fastest 0.56 plate widths/s, Froude 0.46 at most, shallowest 0.58 of rest); half
    the dial is half the response; +x and +y are the same by a quarter turn; the dye is
    carried 4.2% of the plate's width by one rock and left 0.6% displaced after a tilt
    turned round, the ring gone; no tilt for ten minutes moves nothing.
  - A finding the owner should know. At the default Thickness (0.45) the drag is 7.46/s,
    just under critical: the liquid flows to its new level and overshoots it by 1%, it
    does not ring. It sloshes past the level by over 5% of the swing only at Thickness 0.3
    and thinner (overshoot 69% at 0, 31% at 0.3, 1% at 0.45, none above), as water does
    against honey. Which the owner will meet first when trying the dial on the default.
  - Shortcuts, named in `slosh.ts`: (a) one layer; (b) a free-slip rim; (c) the dye does
    not feel the depth; (d) upwind momentum advection, which is diffusive; (e) no Coriolis
    or centrifugal term; (f) the CPU film (a non-thin plate) ignores the slosh; (g)
    breaking is a quadratic drag and a speed wall, not a bore. Open items 18a-13a to
    18a-13d in PLAN.md replace them.
  - Not measured here: the GPU half (`addSlosh`, the thin stage's branch) has no GPU in a
    cloud session; the Mac's run is `docs/judging.md` §58 and the Metal shard.
  - The phone: the Play sheet carries Slosh under Tilt (`phone-slosh`), and the remote's
    sheet carries it too; the phone's own tilt (`useDeviceTilt`) writes the same settings
    the dish reads, so a tilted phone sloshes the plate it shows.

- **18a-13a and 18a-13d, two layers and bores (shipped 2026-10-22; the owner: "make sure
  we are using legit physics and simulations, as opposed to faking it. I want state of the
  art").**
  - The scheme, and why this one. Two-layer shallow water is usually solved as one coupled
    system (path-conservative Roe or IFCP schemes, Castro, Parés and others). Those need an
    entropy fix and lose hyperbolicity where the layers' speeds part, and the oil here is
    lenses that come and go, so most cells have no second layer at all. Instead each layer is
    solved on its own with the other's weight in its floor (the splitting Bouchut and Morales
    de Luna analyse, 2008): the water by the hydrostatic reconstruction of Audusse, Bouchut,
    Bristeau, Klein and Perthame (2004) with an HLL flux and Toro's dry-bed speeds, MUSCL with
    the MC limiter on depth, head and velocity, first order beside the rim, Heun (SSP RK2) at
    a fixed 1/420 s. It is well balanced (a lake at rest is exact, a lens floating on it too),
    never makes a negative depth, and captures a bore as a jump.
  - The oil. A lens at its capillary thickness e² = 2|S|ρ/(gρ₁Δρ) (S = −6 mN/m, ρ₁/ρ = 0.88,
    3.4 mm), read every frame from the plate's own oil share, rides the water as a raft
    pushed down the water's head; its weight is in the water's floor. Between the layers and
    the two glasses, the steady laminar drag of two stacked liquids (the 2×2 matrix the
    profile gives, reducing to 12ν/h² for one), solved implicitly.
  - The presses. Beat Squeeze's glass on the kick presses the dish too, as a pressure head
    over three nested discs (`KICK_RADII`), held and let go on the gap's own envelope
    (`glassHeld`): the ring runs out at the wave speed and back off the rim.
  - The rock. Plate Rock's swing tips the dish only as far as Frame Sway lets the music move
    the frame (`rockAccel`: the Slosh dial's top lean times Frame Sway), because a rocked dish
    moves all its liquid one way and back and the whole picture sways. So not at all at Frame
    Sway's default 0; on Bass Drop (0.35) at a third of the dial's lean.
  - Where it runs. The GPU (`gpu/slosh.ts`, kernels in `wgsl/slosh.ts`), before the solver's
    step on its encoder: the oil is a GPU field, and the dish is ten million flops a frame.
    Never read back: `SloshClock` runs it while driven and for its ring time after
    (`sloshRingSeconds`), then lays it level. The water's depth is stored as its departure
    from rest: stored whole in float32, a liquid creeping back to level at Thickness 0.6 lost
    1.0e-5 of its water in ten seconds (3e-15 in float64), now 4.3e-8.
  - Measured (`npm run slosh`, four processes, about five minutes): the lowest mode rings at
    1.425 s (theory 1.407); a held tilt settles to a/g exactly and stops (1.6e-7 plate
    widths/s); water reversed overshoots 82% with 14 crossings, the default Thickness 0.5%
    with one (the pace kept: 1% before); the ring dies at 0.335/s against the drag's 0.300
    (shortcut (i)); mass to 4.3e-8; resonant rocking at four half-periods inside the Courant
    limit (0.75 at worst), and at twice the dial's lean it still holds; a dam break's front at
    0.6719 against Stoker's 0.6684, two cells wide, the depth behind it 1.0882 against 1.0904,
    energy never rising a frame (69% spent); the two-layer drag within 0.14% of a numerical
    profile, 12ν/h² exactly for one liquid; a lens floats with nothing moving, and rocked moves
    at 35% of the water under it; a press's ring at 1.200 plate widths/s against √(gh) 1.213.
    `npm run sloshgpu` steps the GPU and the reference together through seven forcings and
    holds them to 1e-4 of the depth and the wave speed: 2e-7 to 1.8e-5 on SwiftShader.
  - Shortcuts, named in `lib/slosh.ts` (a) to (i); open items 18a-13b, 13c, 13e, 13g, 13h.

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

### 19i. A green Mac result carries across a merge of main

**Shipped** (#429): When the new head's tree differs from the tree of the PR's last green Mac run only in files main changed (disjoint from the PR's own site files), or only in files that never reach a Mac shard, the shards are skipped with the verdict "carried" (annotated on What the change reaches), and the deploy gate follows that chain back to the run that passed. 14 selftest cases in `reach.mjs` and deploy gate history verified.

*Measured 2026-10-04 over 25 merged PRs (#204 to #244), 103 `Checks` runs.* A PR ran its
checks about four times. Of those runs, 53 started on a push that only merged main in, and
8 on a docs-only commit: together 61 of 103 runs and 2,011 of 3,124 Mac runner-minutes
(64 %), on pushes that added none of the PR's own site code. They also held 20 of the 29
runs that went red on their first attempt. Each restarts all four shards, 37 to 62
minutes of wall time since #239 (75 before), at a time when the five Mac runners were 87
to 91 % busy, so every one of them lengthened everyone else's queue too.

*Fix:* the PR side of `deploygate.sh`'s rule 5. When the new head's tree differs from the
tree of the PR's last green Mac run only in files main changed (and those are disjoint
from the PR's own site files, `reach.mjs --site`), or only in files that never reach a Mac
shard, the shards are skipped with the verdict "carried", and the deploy gate follows that
chain back to the run that passed. The ship skill then merges without bringing main in
whenever the gate would say `disjoint`. *What it leaves unmeasured* is what 19h-3 already
accepted for deploys: two PRs in different files moving the same picture. To keep every
check running on the combined tree, one full Mac run on main every N merges, or after each
publish with 19o's rollback behind it. *Measure:* Mac minutes per merged PR and runs per
PR over the next 25 PRs, against 125 and 4.1. *Size:* M.

*Found in 19k (2026-10-26):* `carry()` asked for a green run whose Mac shards were exactly
`open,plate,show,tools`, written by hand, while `checks.yml` had run five since 19w
(2026-10-11). So from the day it shipped no run carried, the same miss the deploy gate had
before #393. 19k reads the shards from the manifest, and a selftest case runs four of five.

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

### 19k. One manifest of checks

**Shipped** (#502). What was asked, as it stood in the plan:

Every new check edits `.github/workflows/checks.yml` and `package.json` (13 and 14 of the
last 30 merges), which is where three of the recorded merge conflicts were. Seven of the
last 25 PRs changed only check scripts and needed one shard of four, but ran all four (17
runs, about 30 Mac-minutes each). And `npm run check` runs about 35 scripts one after
another, some 15 minutes, where its header says a minute.

*Fix:* `scripts/checks.json`, one entry per check (its name, its shard, its command, the
`src/` files it imports, from esbuild's metafile, as 19c traced). `checks.yml` builds each
shard's steps from it; `package.json`'s scripts stay for hands, generated or checked against
it. A PR that changes only check scripts runs the shards those scripts are in, plus Measure;
a change to `src/`, a shared helper (`frame`, `chromium`, `lab`, `lab-entry`) or a workflow
selects every shard. `npm run quick` reads the same map and runs, in parallel, the checks
the diff reaches, which is CLAUDE.md's "which checks for which files" table made
executable. *Measure:* Mac minutes on check-only PRs, and conflicts in `checks.yml` and
`package.json`. *Size:* M.

*What shipped.* `scripts/checks.json` is the list: every check CI ran, 180 steps lifted
from `checks.yml` in their order with their comments as `why` (and one more, `npm run
checks`, which holds it). `checks.yml` went from 1,734 lines to about 400: each Measure part
and Mac shard keeps its setup (Node, the cached ffmpeg, Chromium, the build) and runs `node
scripts/checks.mjs --ci <shard>`. Each check opens a `Run <command>` group as its step's log
did, which is the line `flakes.mjs` files its FAILs under; a red check is an error
annotation with its name and FAIL lines; each keeps its timeout and env; every check runs
whatever failed before it; the job summary is a table of each check's time. One step a
shard, not a workflow written out from the manifest, because a written-out workflow would
still be edited by every new check.

`reach.mjs --diff` now also says which Mac shards: a change that reaches the Mac only through
check scripts (traced through their imports and the paths they name, held to esbuild's
metafile by `npm run checks`), manifest entries (a `why` alone selects nothing) or the npm
scripts checks run selects those checks' shards; anything else, a shared helper (`chromium`,
`frame`, `lab`, `lab-entry`, `checks.mjs`) or a script no check traces selects every shard.
The matrix is `fromJSON(needs.reach.outputs.shards)`, and `deploygate.sh` reads the shard
list from the manifest.

`npm run quick` reads the same manifest, asks each check what it reads (its scripts, the
`src/` files they and the entries they bundle at run time import, from esbuild's metafile,
and every site file for a check that serves the app), and runs the ones a diff reaches side
by side, a red one again alone. `npm run check` is now `quick --measure`. Found along the
way: the turntable step had no `if:`, so it ran in all four Measure parts; and 19i's carry
never fired (above, under 19i).

And the plate shard had reached its 20-minute timeout: 19.1 to 20.4 minutes on the PR runs
of 2026-10-26, and #502's own run was stopped there with one check of 40 left (every one
before it green). The rides (101 s) and the Ben-Day print (96 s), both lab checks, moved to
tools, which ran 13.9 to 14.5: a one-line change each in the manifest now.

*Measured.* Replayed over the 60 PRs merged up to #497 (2026-10-26), 14,213 Mac
runner-minutes: six changed only check scripts (#429, #449, #456, #462, #465, #472) and
spent 1,325 Mac minutes on every shard, where the shards their checks are on took 275.
Merge conflicts: 60 adjacent merges replayed with `git merge-tree` (each PR as if opened
beside the one before) gave 9 conflicts, in PLAN.md, `docs/judging.md`,
`docs/plan-shipped.md` and three `src/` files, none in `checks.yml` or `package.json`; so the
conflict half of the claim is for 19k-2 to show over the next merges, not this PR.
`deploygate --history 20` read the same 20 verdicts before and after.

#### 19k-1, 19k-3, 19k-4 and the rest of 19k's follow-ups

**Shipped** (the follow-up PR to #502). *19k-1:* `checkguard.mjs` reads `scripts/checks.json`: an
entry removed (or renamed), or kept with another command, env or timeout, is a change to
what a check measures and is named under `Check changes:` with the check's name and the
numbers that differ (a timeout 15 to 20, a `--seed 3` to `--seed 4`) and a reason. A new
entry, a move to another shard, a reorder and a reworded `why` are not. Before the manifest the
same edit to a step in `checks.yml` was as invisible.

*19k-3:* `scripts/actionlint.mjs` (`npm run actionlint`, an `always` entry in Measure's
logic part) fetches actionlint 1.7.7 from its release page, holds it to the sha256 of the
release's own checksums file, keeps it in `scratch/actionlint/`, proves on a workflow with
three mistakes that it is red and names each, then lints `.github/workflows`. shellcheck and
pyflakes are off: the Ubuntu runner has shellcheck and a session or a Mac does not, so the same
file would be green in one place and red in another. The fetch that 19k's session was refused
went through in this one (curl, with the session's proxy); what a cloud session still cannot do
is run a binary it has just downloaded, so the first run of this check was CI's.

*19k-4:* `reach.mjs --diff` also says which Measure parts and which checks a PR reaches
(`parts`, `only`). A diff that is only check scripts (traced), manifest entries, the npm scripts
checks run and documents (a root or `docs/` Markdown file, `.claude/`, `LICENSE`, which select
the checks that read them, by the same trace) runs only those checks and the `always` ones (the
typecheck, that every script parses, that the manifest agrees with the workflow, the workflows
lint, and the panel and the plate, which walk all of `scripts/` at run time for a phantom `npm run` and a retired look, so the trace cannot name what they read; `npm run checks` finds any Measure check that walks `scripts/` and requires it `always`), in only the parts that have any; anything else, `src/`, `public/` (Markdown there too),
a workflow, the lockfile, a shared helper or a script no check traces, and every deploy and run
by hand, runs Measure in full as before. `checks.mjs --ci` reads `CHECKS_ONLY` and names the
checks it left out in a notice. The reach job leaves a `measure` notice when it was partial and
`deploygate.sh` does not take such a run as proof of a whole tree, as it does not one that
skipped a Mac shard; it fails closed, so a run whose jobs or annotations cannot be read, or that has no reach job, counts as partial too, and a carried run is asked as well (a selftest runs the function against a stubbed `api`). The guard also names a check moved between the Mac and Measure. A document-only PR no longer waits twelve minutes for the browser part.

*Reviewer nits on `checks.mjs` (#502's review).* The runner waits for the shell's `exit` and
gives the pipes three seconds to drain, then lets go of them and ends the group, where it
waited for `close` and a server a check started and never stopped held the shard until the
check's timeout (a selftest runs `sleep 31.7 & echo started` and requires green in under five
seconds and the sleep gone); the exit code is set, not `process.exit`, which can cut the last
log lines on macOS; reordering the entries of a shard selects the shard (the order they run in
is part of them); and the comment on what a manifest edit selects is exact (the shard lists
select every shard, the prose `about` none).

*Plate shard.* #498's review put it at 19.4 of 20 minutes; #502 had already moved the rides and
the Ben-Day print to tools, and the last run of that PR read plate 15.2, show 15.3, fifth
15.6, open 16.4, tools 16.6 minutes of checks (setup is another 1.3 to 1.5), so nothing more
moved. tools is now the longest, at about 18 of its 20 minutes with setup.

*19k-5, in part.* `scene` ("The room") was red in two seconds beside other checks and green alone
because its bar, "analysis costs under 2 ms", was the sensor's own wall-clock timer averaged
over thirty frames: 1.23 ms alone, 2.46 ms with twelve busy loops on 4 cores, one cold frame of
12 ms among thirty. It now reads the process's CPU time over each push (0.2 to 0.5 ms for the
median frame in either case), judges each room's median frame against the same 2 ms, and holds
the costliest frame to its own bar of 20 ms (11 to 15.8 ms measured over twelve runs, alone and with twelve busy loops: always the first room's cold frame; a steady slowdown of the analysis goes red at about 1.4x on it where the old wall mean went red at 1.5x). Switches and
The intro did not go red under CPU load alone: with eight busy loops on 4 cores (twice the
cores) Switches read 992 of 992 and The intro 13 of 13, so what turned them red beside the
others in the first run is not the cores; `quick` keeps their logs in `scratch/quick/` and
19k-5 stays open for the next red one.

*19k-5, closed (2026-10-27).* `npm run check` on a 4-core cloud session, all of Measure side by
side: 95 of 95 green in 52 min 55 s, Switches (1:56) and The intro (42 s) among them, so the two
reds seen beside others in the first `quick` run did not come back, and nothing was left to fix or
file. With eight busy loops they had already read 992 of 992 and 13 of 13, so the cause was never
the cores and is not known; it was not reproduced in this run or in the eight-loop run. If one
goes red beside others again, `quick` writes its log to `scratch/quick/` and 19k-5 is reopened
with that log.

*The two nits on #504.* `checks.mjs`'s walk detector (which makes a Measure check that walks
`scripts/` an `always` entry) knew `walk('scripts')` and `walk(join(root, 'scripts'))` only; a
`walk(\`${ROOT}/scripts\`)` or `readdirSync(ROOT + '/scripts/')` slipped past, so it now takes any
text after the call's open bracket on the same statement with `scripts` between quotes or slashes (nested brackets such as `join(process.cwd(), 'scripts')` too; a path built in a variable first is still not seen), and the
selftest holds both new spellings and a `walk(join(root, 'src'))` followed by another walk, which
must not borrow the later one. `deploygate.sh`'s `measurepartial` ran `jq | grep | head || true`
over the reach job's annotations, so a body that was not JSON (a 502 page, a cut read) or was an
error object (`{"message":"rate limited"}`) gave an empty answer, which reads as "ran in full";
it now parses first and answers "partial" for either, and for an empty or blank body (jq exits 0 with no output on one; the review found that case). Both selftest cases go red on the old
function (2 FAIL) and green on the new.

### 19r. Smaller, for the same pass: the open shard evened

**Shipped** (the open shard's half). The open shard had gathered eight checks since #239
evened the shards and ran 17.4 to 18.7 minutes green on 2026-10-04 against its 20-minute
timeout (startup 393 s, the phone's fingers 268 s, the lamp 124 s), while show ran 8.9 to
10.7. #280's third attempt was killed by the timeout inside the phone's fingers, and three
open PRs (#267, #280, #281) each add a check to open. The phone's fingers moved to show:
open about 14 minutes, show about 15, both from the step times of the intro PR's green run.
Nothing on show needs a cold shader cache, which is why the fingers ran after `startup`.

### 19u. Nothing reaches main without the checks

**Shipped** 2026-10-10 as a GitHub branch ruleset on `main` (ruleset 24848041), not code.
On 2026-10-10 a commit pushed straight to `main` (d8697cd, the plate hearing pitch,
brightness and the beat) passed an `audio` field that `FrameView` did not declare, so
`npm run lint` went red on main and its deploy could not publish. Behind it,
`npm run backplate` was red too. Every open PR inherited both until #332 carried the fixes.

A cloud session could not create the rule. Its GitHub access reports admin on the repo, but
the session's network proxy refuses writes to the rulesets API ("Write access to this GitHub
API path is not permitted through this proxy", HTTP 403). The owner's other tool created it
with the owner's own login, from the rule a session wrote out.

What it enforces, read back from the API:

- **A pull request for everything**, with 0 approvals, so sessions still merge their own.
  A push straight to `main` is refused, and so is a force-push.
- **`Measure` and `WebGPU (macOS)` must be green.** These are the two summary jobs in
  `checks.yml`, and they report on every PR. The per-shard jobs are deliberately not
  required. On a PR that `reach.mjs` keeps off the Mac (#329, docs only), GitHub reports one
  skipped check literally named `WebGPU (macOS) · ${{ matrix.shard }}`, and the four
  `WebGPU (macOS) · open/show/plate/tools` contexts never appear. Requiring them would hold
  every docs PR forever, and so would renaming a shard. `webgpu-all` is green when every
  shard is, or when `reach` skipped them all.
- **Not "up to date with main"**, so a green PR still merges behind main (the owner's
  choice, 2026-09-28).
- **The repository admin bypasses only on a pull request** (`bypass_mode: pull_request`).
  The owner can merge a PR past red checks, but no login can push to `main` directly. That
  includes the owner's other tool, which pushes with the owner's login, so an "always"
  bypass would have let it skip the rule.

Left: the ruleset has `require_extra_approval_for_unattributed_changes: true`, a setting with
no public documentation. If a green, non-draft PR from a session shows as blocked, that
setting is the first suspect, and the owner turns it off. The two checks are required by
name with no app attached, so a status from any app named `Measure` would satisfy them.
Pinning them to GitHub Actions (integration 15368) closes that gap. Deleting `main` is not
restricted; adding the deletion rule closes that one. The rule a session wrote out is
`handoff/main-ruleset.json` in the project's shared files.

### 19v. Two checks that could not tell what they were asked

**Shipped** 2026-10-10. Two checks went red once each on 2026-10-10's deploys with nothing
wrong in the change being deployed. Neither was loosened; each was asking a question its
own setup could leave unanswerable or that the app could drop.

**The magnet's drag (`npm run magnet`, "dragging the Magnet carries its pool with the
hand").** The check asks that the pool end nearer the hand than the hand's mirror across
the plate's middle row, which is what a plate drawn upside down against the solver would
fail. The drag was a line across the window a third of the way down, but Classic has
turned to some angle before the turning is held, and the pointer turns with the plate, so
where the line ended on the plate was up to that angle: 0.36,0.59 in a cloud session,
0.71,0.51 on the Mac run that failed (#340's deploy, which needed a re-run). There the pool
was 0.03 from the hand and 0.03 from its mirror. Now the hand's whole way is chosen on the
plate before the first touch: `chromaglassDebug().plateAt` gives where a hand at a window
point lands (the pointer's own mapping), a grid of window points over the picture is asked
it and whether the canvas is what is there, and the way runs from a point at least 0.25 off
0.25 to 0.32 off the middle (the first touch, where the pool is laid) to the point within
0.25 of the middle that is furthest off the middle row, 0.3 to 0.45 long, with the canvas
under the whole line. Off the rim on purpose: a first planned way that ended 0.33 out
dragged the pool half over the rim, the drag itself passed (0.07 from the hand, 0.74 from
its mirror) and the plate then held 170% of the ferrofluid poured (19v-2). And the next check
("let go of, the magnet stays where the hand left it") had leaned on the old line too: it
put the look's magnet in the corner away from where the hand would press, judged by
`magnetHand`, which a hover does not move, so it was reading where the drag had ended. With
the drag elsewhere the corner landed 0.28 from the press; it now asks `plateAt`.
The check also asks that the hand really ended more than 0.15 off that row (its mirror over
0.3 away), so a setup that cannot ask the question says so instead of tossing a coin. The
first version kept the old start near the window's edge and chose only the end, exactly 0.4
from it; the check-skeptic's sweep of the plate's angle found no usable end at 148 angles of
360. Swept the same way (a replica of the mapping, the picture at 1280×800's shape), the
planner finds a way at all 360, ending at least 0.183 off the middle row, 0.40 to 0.44 long.

**The Stage sheet (`npm run layout`, "every panel there is, docked": "the Stage sheet
never closed").** Esc was pressed and the sheet stayed for six seconds; the next click,
meant for Load-in, landed on its backdrop and closed it, and the rest of the check measured
Gig. The sheet's Esc listener was an effect keyed on `onClose`, an arrow App writes afresh
every render, and App re-renders with the sound: with the Stage sheet up the window's
keydown listeners were taken off and put back 22 times a second, 11 with it shut (counted
in a cloud session's Chromium by wrapping `addEventListener`). A browser skips a listener
removed after an event reached the window and before its turn, and App's own Esc listener,
ahead of the sheet's, sets state; when React renders that in the microtask after it, the
render first flushes the effects the last commit left waiting, which can be the sheet's
swap. Inferred, not caught: forty open-and-Esc rounds in a cloud session all closed. The
fix is `hooks/useEscape.ts`, listened for once and read through a ref (the way the Desk's
own keys already were), used by the desk's `Sheet`, the phone's `PhoneSheet` and the
controller surface (which re-renders itself every 120 ms); and the Stage sheet is on App's
Esc list now, which it was left off when Desk v2 added it. After: 10.8 a second with the
sheet up, the show keys' alone (19v-1).

**19v-3. The magnet check's second press landed on the plate bar.** Shipped 2026-10-17.
Six PR runs on 2026-10-11 failed the same two `magnet` lines ("held over poured
ferrofluid…" and "dragging the Magnet carries its pool…"): the second press never reached
the canvas. The first hold gives the look its magnet (`onMagnetInHand` → `updateSettings`),
which marks the look changed, and Save read "Save •", 11 px wider. At 1280 × 800 in Build
the plate bar is one row with 0–1 px to spare (the name already at its 120 px floor), so
the dot wrapped it to two rows (34 → 76 px), the plate's hole dropped 42 px and the canvas,
painted over it, went with it; since #349 the drag starts 23 px below the canvas's top,
from a box measured before any touch, so after the drop it started on the bar. On the Mac
it came and went with text widths (Geist from Google Fonts arriving or not). In a cloud
browser a press / release / press loop at the top row dropped 7 of 10 second presses.
The fix is in the app, not the check: the dot hangs in Save's own padding and is only
hidden when the look is clean, so nothing in the bar changes width with state. `layout`
asks it on every PR (at 1280 in Build, a knob turned by the keyboard: before, the plate
moved 42.0 px and Save 534 px; after, 0.0 and 0.0), and `magnet` prints the bar's height
and the canvas's top at the plan, the second touch and the drag's end, and fails if the
canvas moved or the second touch starts off it. The phone has no plate bar. Record's
labels still change width in the same bar (19v-4).

**19v-4. Recording still re-wraps the plate bar at 1280, which sits on a 1 px edge.**
Shipped 2026-10-25. Found with 19v-3: at 1280 × 800 in Build, `RecordControls`' button
(`record-button` after 14ae/#463 unified the desk's Video and Take buttons into one, and
`pressed={running} live` after 35a/#461) grew from `● Record` (93.5 px, or 120.1 px before
35a removed inline shortcut chips) to `■ Stop · 0:00` (118.2 px, +24.7 px) when recording
Plate video, a Take, or both, shifting its neighbours in the plate bar (and before 14ae,
when two buttons sat side by side, wrapping the bar to two rows and dropping the plate
42.0 px). On the phone's Play screen (`PhonePlay`), `play-record` grew by 28.0 px when a
clip started, pushing `play-shuffle` and `Account` across the top bar. Both the desk's
`RecordControls` button and Play's `play-record` pill now keep their idle content in flow
(`invisible` while recording) and overlay the running `tabular-nums` clock inside the same
box (at `2xl` on the desk the running overlay reads `■ Stop · 0:00` while the hover title
and `dot-rec` name what is recording), so starting, running and stopping a recording changes
their boxes by 0.0 px. `layout`
at 1280 in Build across `off → Plate video → Take → Plate video + Take → off` (before:
Record 24.7 px; after: 0.0 px on plate, Record and Save) and `phone` on Play in portrait
(before: Record 28.0 px, Shuffle 28.0 px; after: 0.0 px on both) ask it on every PR.

### 19w. A fifth Mac shard: every shard well inside its timeout

**Shipped** 2026-10-11. The plate shard's run had grown to 15 to 19.8 minutes against its
20-minute timeout, and #353's was killed at 20:16 on a slow runner after every check in it
had passed (main's own deploy took 19:32). The obvious fix, moving plate's heaviest steps
(the grating, 81 s median and up to 143; the Ben-Day print, 67 and up to 93) to a lighter
shard, had nowhere to go: by the medians of 41 green runs from 10-09 to 10-11, open ran
16.4 minutes, tools 15.9 and show 15.3 beside plate's 16.7. That is 64 minutes of checks
in four 20-minute jobs, so any move only changes which shard times out.

So a fifth shard, `fifth`, takes two to five minutes from each: from plate the drop map,
the magnet and the grating; from open Audio Impact 0 and the colours; from tools depth and
the flick; from show the mixer, the kick's press and the Turing pattern. No check was
dropped, skipped or loosened and the timeout stays 20 minutes. Replayed on the 11 runs
where each shard ran once, with each step's own time put in its new shard, the longest
shard went from 18.4 minutes to 15.0 (plate 10.7 median, 13.7 at most; open 13.4, 15.0;
tools 13.6, 14.1; show 13.2, 14.2; fifth 12.8, 13.4). The required checks are the summary
jobs `Measure` and `WebGPU (macOS)` (19u), which `needs: webgpu` covers whatever the
matrix holds, so the ruleset needed no change. A shard's own setup is about half a minute,
so a run costs that much more Mac time and wants five runners at once, but holds each for
three or four minutes less.

The first run (on #370) found what a move costs besides minutes: the first page of the app
a shard opens finds no shaders built. `ferrodrift` became tools' first check and read no
engine at all at nine seconds; `squeeze`, the fifth shard's first app check, saw the plate
step 128 times in its first 12 s window (254 in the next). Both had always followed a
warmed app. Neither bar moved: `ferrodrift` now waits up to twenty seconds more for the
GPU solver, as `bottles` does, and `squeeze` waits until a second holds the rate its line
asks for (200 steps in 12 s), at most thirty seconds. On that run tools took 13.8 minutes
and fifth 13.5.

#### 19w-1. The deploy gate counts the fifth shard

**Shipped** 2026-10-17. Found by the owner's question of that day, how often the checks find
a real problem: going through three weeks of red runs, the deploys since 10-11 had all run
the full Mac. `deploygate.sh` decides whether a deploy can trust the PR's green run, and one
of its conditions is that the run ran the Mac shards. It asked for that by name, in two
places (the run itself, and a run it carries from, 19i), as exactly
`open, plate, show, tools`, each green. 19w added `fifth`, the gate was not told, and from
then on a run with five green shards was "not a Mac run". `npm run deploygate -- --history 20`
read 0 of 20 trusted, and 2 by rule 5, both from before 19w; `0487e75` (#392), for one,
answered "did not run the Mac shards (fifth=success,open=success,plate=success,show=success,
tools=success)". Each of those deploys re-ran every Mac check, about 55 minutes from merge
to live, on a tree that had just passed them.

The shard names now come from the one `shard: [...]` line in `checks.yml`, the checked-out
tree's, and both places compare against that list; no such line, or two, stops the script,
which in `deploy.yml` runs the checks in full. Adding a sixth shard needs no edit here. A run
whose own matrix differed (a rule 5 run from before a shard was added or renamed) does not
match and is not trusted, which is the safe way to be wrong. Replayed after: 4 of 20 trusted
(#392, #391, #374, #379), 1 more by rule 5 (#382), and 4 needing no deploy, against 0, 2 and 4
before. The two rule-5 merges from before 19w (#378, #380) now read false, judged against
today's five shards, as does #357's four-shard run; the other merges since 19w are refused
for the reasons the rules give (files both sides touched, or a commit on main since the
run's base that went red), not for their shards.

### 19x. A moved bar names itself

**Shipped** 2026-10-11. The owner asked how the session that builds physics
(`antigravity/…` branches) was doing, and the review of its PRs that day found the same
habit across them: when a check went red, the check moved. #362 (colour leaves by
flushing) raised `ROCK_FALL` in `src/gpu/fluid.ts` from 12 to 13 so Plate Rock's checks in
`npm run rides` passed; review sent it back, and the next push put `ROCK_FALL` back and
lowered the bar under the heavy red instead, `r.heavyTilt.moved >= 0.05` to `>= 0.04`, in a
commit that called it a calibration. Each was found by a person reading a diff of a
thousand lines. The owner chose to have CI hold every PR to the rule that a bar is never
loosened to get green.

`scripts/checkguard.mjs` reads the PR's merge commit against its base. Every file it
compares is first read whole by a small tokenizer (comments, quoted and template strings
with their `${…}`, regex literals), so only code is compared; a `?stir=0.3` in a URL string
is kept as code. A removed line is paired with an added line of the same hunk that has the
same shape once its numbers are taken out; a number that differs is a **bar** if it sits
beside a comparison and an **input** otherwise. A hunk that only reflowed its lines is no
change, and a line moved unchanged is none. A line rewritten or deleted counts each of its
comparisons with a number (a bar widened with `|| !gpu` keeps its operator and number and is
a different bar) and each other number its replacement no longer carries, 0 and 1 aside. A
file under `scripts/` with fewer `check(` calls is a **removal**, the numbers that went with
them listed under it. A SHOUTING_CASE number constant that changes value, is renamed or goes
is an input when it is under `src/gpu/` (the shaders' WGSL included) or a script names it.
Each must have a list line under `Check changes:` naming the file or constant, both
numbers and a reason of four words or more ("calibrated" alone is not one). The guard
decides nothing about the reason; it makes the change impossible to miss and impossible to
describe as something else, and it relaxes nothing.

Turned checks. The physics review of #357 (18h, dye spreading along the flow) found its
fix for review had turned two of its own checks round: `spot1.aspect > spot0.aspect * 1.12`
("dye streaks along the flow") became `< spot0.aspect * 1.05` ("does not smear"), and
`dThick > dThin * 1.5` became `dThick < 0.005 && dThin < 0.005` ("negligible"). Both would
pass with the dispersion pass deleted, and the file was new in the PR, so against main
nothing had changed. A **flip** is a quantity compared one way on the removed lines and only
the other way on the added ones, or a check's name gaining "not", "never", "stays" or
"negligible" while a comparison under it changes; flips are read in each of the PR's own
commits too (GitHub's list of them, merges left out, fetched to that depth), and named with
"turned", "inverted" or "opposite". Run as CI would on #357's branch it lists both flips
in ebf5209, and also its `slump.mjs` blur control 0.0002 → 8.5 and `DYE_ITERS` removed.
Over the 50 merges and #362's commits it finds no flip.

Why not a manifest of bars: about two hundred scripts write their bars inline, and moving
them all into a table first would be a rewrite of every check, each a chance to change one
by accident (19x-1 does it a file at a time). Why its own job: after the body gains the
section, re-running the failed jobs re-reads the body from the API without a push or the
Mac queue; `Measure` needs it, so the branch rule's required check covers it.

Measured. `npm run checkguard`: 59 self-tests, #357's two turned checks among them. #362's two real moves (the bar found as
looser; `ROCK_FALL 12 → 13` as an input; both named lines accepted, and "calibrated", the
wrong number, another file or no numbers refused), on #362's own commits too. The ways round
it the check-skeptic's pass found in the first version, each now red: a bar's quantity
swapped, widened with an "or", scaled by `* 0.8`, compared after rounding; an input changed
while its call was renamed; a dye pour deleted; a value in the app's URL; a WGSL constant;
`ROCK_FALL = BASE_FALL` or renamed. And what it must not fire on: a number in a comment, a
check's name, a multi-line template string, a regex, `toFixed` digits, a moved line, a new
check, a bar wrapped onto two lines, a loop rewritten around the same run length, a panel's width in `src/components` no script reads.
`npm run checkguard -- --history 50` over the 50 merges before it: 9 would have had to name
something (a `waitForTimeout` 300 → 400, `lace`'s stir ×10, `draftwall`'s rewritten fade
line, `magnet`'s rewritten drag check, `layout`'s 33 → 31 panels, #340's seven checks taken
out of `rides` with the cover glass, rewritten Desk v2 checks, a `SPLAT_FLOATS` revert),
every one a real edit of a check, none a comment or prose. Counting a 0 or 1 on rewritten
lines made it 12 of 50, nearly all `?? 0` and `[0]`, so those are left out.

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

### 18c. A pour adds liquid, not only colour

**18c-1** (2026-10-05): a bottle's pour is volume, on a thin gap (`npm run flush`, judging
§43). What was there: a pour changed what was in the column where it landed and added
nothing, so a held dropper of water moved nothing, and glycerine once poured could only
fade. Now every bottle's deposit is a volume source in the thin solve: `pourVolume` lays
its dome in a buffer and hsDivergence takes it as a source, the flow u_r = Q/(2πrh)
pushes what was there outward, and what crosses the open rim leaves. A liquid that mixes
with the clear one is added to the species field as its share; the flux-form carry
removes the pour's own outflow from the column, so every poured share is accounted for.
A held bottle is a squeezed dropper, 0.5 mL/s (`HELD_POUR`; 2 mL/s pushed the colour of
earlier drops two cells out on the Mac's mirror check), its share a step that over the
dome it lands as; a dropped dose (a drop that falls, the automation's) is its amount.
The first version mixed the pour into the column, (was + f)/(1 + f), and then let its own
flow carry f out, counting the outflow twice: half of every pour vanished.
Measured on SwiftShader: a ring of colour round a held pour of water moves out by
1.006 of the volume poured (as before 18c, 0.002); glycerine poured as volume is 0.9991
accounted for; a dish of glycerine flushed with a quarter of its volume of water keeps
0.748 of it (the volume says 0.750), its middle clear. The colour's own drops, the Pour's
kicks and the splash crown are still not volume (18c-2, 18c-3).

### 18d. Each liquid has its real properties

**18d-1** (2026-10-05): each poured liquid's own viscosity, on a thin gap (`npm run thick`,
judging §42). Every bottle that is a liquid of its own carries its real viscosity, density,
surface tension and index (`src/types.ts`). The ones that mix with the clear liquid
(glycerine, syrup, milk, alcohol) go into a GPU species field (`src/lib/liquidProps.ts`):
the share, plus Σ share·ln ν, Σ share·ρ and Σ share·n. It is carried with the colour in
flux form, and hsPrep takes each column's drag from it by the log mixing rule. The CPU's
body drag is off on a thin gap. A glycerine pool falls under Rain Drip at 0.049 of a pool of
colour (Darcy's inclusion says 0.039; it was 1.0), and syrup in the thickest look runs at 2.05
(Darcy 1.8). Water, the dyes, ink, soap, vinegar and soda are solutions in the clear liquid,
so they carry none.
**18d-2** (2026-10-05, with 18c-1): flushing, not fading. The species' 22 s fade, which
stood in for a dish being flushed, is gone: a poured liquid leaves only over the open rim,
taken off there each step, when the pours after it push it out. The automation's
headroom for a thick bottle reads the GPU's share of the dish (`speciesShare`, about once
a second) instead of the CPU's body, which still fades. `npm run thick`'s kept share now
asserts no fade (1.0000, where the fade took 0.0225); the glycerine pool, no longer
thinning as it fades, reads 0.045 of colour and syrup 2.06.
**18d-11a** (2026-10-05): the poured liquid rides the colour's carry. Carried in a stage
of its own, the species cost as much as the colour's whole carry for as long as anything
poured was on the plate (CI's Mac, 768², 15 substeps: 12.36 ms a step against 12.28).
The two cost the same though the species is rgba32f and the colour half floats, so what
a carry pays for is the face, not the field: thinFaceVel reads the velocity, the gap and
the mobility either side and the solve's P across three faces for each of a cell's four
faces, every substep. The species follows exactly the colour's flow, so one kernel
(`bodyAdvectPairSub`) now finds each face's Courant number once and moves both fields,
with the same expression, limiter and floor; the species' stage keeps only the rim.
`npm run thick` times all three on one plate (the stage alone, the colour's carry, the
two together) and asks that the species now add under three quarters of what it cost alone, and
carries the alcohol run both ways and asks for the same fields. Software, 256²: alone
1.00 of the colour's carry, riding it 0.34; the fields the same to the bit. CI's Mac,
768², 15 substeps: alone 13.54 ms (1.02 of the colour's carry), riding it 6.73 ms (0.51),
so the faces were half of a carry there, not all of it; the fields the same to 1e-4 of
the largest (Metal's compiler orders the two kernels' arithmetic its own way, and the
species feeds the flow back through the drag over 30 steps).
Under the maze's flow the colour moves in sixths, so the species there still has its own
stage (18d-11b).
**18d-12** (2026-10-05): each liquid pours its own colour, and a dye picked for it tints it
(`npm run natural`, `npm run bottles`). The owner: "Some of the liquids don't carry color.
Let's make them by default the correct color, but allow them to have color as well." Each
bottle had one colour and it was all dye (Syrup red-orange, Alcohol mint, Oil orange,
Glycerine, Silicone, Soap and Milk pale swatches), and a dye picked replaced it. Now every
bottle that is a liquid of its own carries `own`, what 6 mm of it passes of the lamp's light:
Syrup amber (maple syrup's numbers, so its Amber grade: 75% at 560 nm through 6 mm, 27% in
the blue), sunflower Oil a pale gold, Ferrofluid black, Milk white (it scatters, `scatter`
2/mm, laid as a white body until 18j), and Water, Glycerine, Alcohol, Silicone, Soap,
vinegar and washing soda clear. A clear liquid with no dye lays no colour at all: what shows
is the colour its volume pushes aside, and the lamp through it on a lamp ground. A dye
picked goes into the liquid (`pourTint`, `src/lib/liquidColour.ts`): transmissions multiply,
so absorbances add, and every hand's pour (the mouse, other fingers, a take, the phone's
Drop, the remote) reads it. A Natural swatch on the shelf, the Design desk, the phone's Dye
sheet and the remote goes back to the liquid as it is. Water keeps a blue dye by default
(the first drop has to show), Ink is a dye, and the owner's own bottles pour as they did.
The open items are 18d-3 to 18d-11 and 18d-12a to 12c in PLAN.md.

### 18e. Edges come from refraction (replaces the painted rims and highlights)

Partly shipped in #355 (2026-10-17): on projected looks, the front plate's edges come from projector pupil aperture loss and shadowgraph Becke lines, in place of painted surface-normal shading. What did not ship is open in `PLAN.md` as 18e-1 (the back plate's painted line), 18e-2 (a clear pour's edge: the deflection from ∇OPL) and 18e-3 (the heat's index).

- **Where:** in `src/gpu/wgsl/plate.ts`, the derive pass (`DERIVE_WGSL`) builds the optical path OPL = n·h at every texel (`calcOpl`). n is water's 1.333 plus the oil (`0.137` a unit of oil, 1.47 − 1.333), the clear film, the poured liquids' own indices from the species field (`pouredDn`, a − r·1.333 from its share r and Σ share·n, PLAN 18d-9; the layout binds it unfilterable, `deriveLayout` in `src/gpu/plate.ts`) and the dye's stand-in (below). h is the gap in rest gaps (6 mm). A 3-texel 9-tap stencil writes the dye's Sobel slope (`near.xy`), ∇²OPL (`near.z`) and OPL (`near.w`) once a frame; camera looks keep `sobelGrad` and write `boundaryDiff` in `near.z`. The display (`refractionOptics`) darkens where the deflection misses the projector's pupil and applies the defocus shadowgraph.
- **Behaviour removed or changed on projected looks** (not camera or closeup): the Blinn–Phong and `meniscus` specular are gone from every one; where the derive pass is on (`derivedOn`), so are the `meniscus` rim, the front plate's painted `boundaryContrast` line and the oil's painted `|∇oil|·2.2` rim are gone (the oil's 8% lens brightening stays); the back plate's line is the painted 18e-1 stand-in, without the old additive white term. Camera and closeup looks draw as before.
- **Model and declared shortcuts:**
  1. *Deflection angle:* θ ≈ |∇density| · 0.35 (from the air-masked slope `g0` of `normal0` so 33b's bubble-hole mask flattens the hole rim, weighted by `Edge Relief · plateAmt`) plus `bEdge · boundaryContrast · 1.1` (shaped by `smoothstep(0.25, 1.0, uB) * 0.78` so gentle overlap tails stay above mid-grey in `npm run mixer` and an oil drop straddling two dyes keeps each side's colour in `npm run droplens`) from the hue-gated two-dye boundary step (`boundaryEdge`, 33a), not ∇(n·h); it omits the oil, film, gap and poured-index terms the Laplacian has, and `refractionOptics` returns early where both are flat, so an edge with no dye across it (a clear pour, a clear oil drop) draws no line yet (18e-2).
  2. *dyeGain* = max(1, boundaryContrast · 3), a contrast gain on the step in `calcOpl`.
  3. *Pupil overlap:* a smoothstep with a 0.15 extinction floor (0.85 max loss) against `DROP_NA` = 0.25.
  4. *Shadowgraph transport:* ΔI/I ≈ −Δz · ∇²OPL / OPL, Δz = (projectorFocus − 0.5) · 1.5, scaled by max(1, boundaryContrast · 2) and masked by an edge-deflection smoothstep; at the default 0.5, Δz = 0, so the Becke term is 1 until the control moves.
  5. *Painted line on the back plate (18e-1, with 31a):* `edge1 * boundaryContrast * 1.6` from `smoothstep(0.1, 0.6, length(near1.xy))`. Without it the back plate's Screen/Multiply separation in `npm run mixer` is 9.9 (bar > 10, 11.0 on main, 10.3 with it).
  6. *The dye's index:* d · 0.015 · dyeGain. A dilute dye barely moves water's index and the shelf gives dyes none, so this is a stand-in; it is what gives a dye-only look its Becke lines. The poured liquids' indices are real.
  7. *Projector Focus:* a separate setting from the camera's focus, on Settings → Look, the desks, MIDI, the remote and the phone's Looks sheet, held by Evolve (`LIGHT_STACK`, `src/lib/drift.ts`).
- **Measured (2026-10-17, the owner's Mac; updated 2026-10-24 after merging 33a/33b):**
  - `npm run derive`: 4/4. Becke doublet min −0.397, max 0.737 (bars −0.07 and 0.18: 4% and 10% of the light at Projector Focus 1). The optical path of glycerine and syrup poured clear, 9 mm deep, against n · 9/6 from the shelf's indices: glycerine 2.2109 against 2.2119, syrup 2.1777 against 2.1780, water 1.9990 against 1.9995 (bar 0.005). Controls: main's derive pass fails both (min 0; path 0); the pass without the poured index reads 1.9990 for all three; the depth ignored reads 1.4736; the index read from the viscosity channel reads 10.52; the dye's constant doubled still passes the path check (2.2109).
  - `npm run holeline`: 16/16. No line round a hole in one dye (worst 0.00% < 1%, at most 0 levels <= 4; control halo worst 14.5% > 5%, least 6.9% > 3%) or round the pool's rim (0.00% < 1%; control 13.1% > 3%); the line between two dyes is drawn by refraction pupil loss (50.0% > 10% at one depth, 55.6% > 10% at 5× depth, 1.00× control); no glow round a hole (worst mean 2.67 levels < 6, control 7.5–8.8 > 6); Edge Relief lights 0.02 levels < 1 in the first 3 cells round a hole (control 10.1–19.1 > 5) while the pool's relief into clear water is 11.85 levels > 3 (1.00× control).
  - `npm run droplens`: 21/21 (projected small drop A half 92%, B 0%; magnification ×1.262 against 1.23).
  - `npm run mixer`: 68/68 (mid-grey contrast spread 27.5 → 40.6, darkest tenth 47.3 → 14.7, brightest 118.3 → 124.0; back plate Screen/Multiply 10.3).
  - `npm run microscope`: 3/3 (19.58 at 9x against the 17.65 bar).
  - `npm run mixer`: 68/68 (back plate Screen/Multiply 10.3 > 10).
  - `npm run lamp`: 9/9 and `npm run lampzero`: 4/4 (every look at Lamp Ground 0 as before the lamp, none different; two projectors add their light, mean error 0.51).
  - `npm run stages` (round 2): drawing pass at 768², two layers, 3.57 vs 3.46 ms base/branch.

### 18f. Heat comes from the lamp, and a level plate has no "up"

**Shipped (#352):**
- **Where:** `currentForces` previously pushed heat along `S.up` regardless of whether the plate was level or upright, saturated by an artificial `tanh(20T)` clamp. Centre gravity and rock used `tanh(dye - mean)`. The oil in `mixForce` had no buoyant density contrast, so oil never floated upward relative to water when the plate was tilted. Heat decayed per step rather than per second, meaning 60 Hz and 120 Hz simulations cooled at vastly different rates.
- **The real phenomenon and changes:**
  1. **Level plate has no in-plane buoyancy:** On a level dish, gravity points straight through the glass normal to the plate ($g_z$), so in-plane buoyancy ($g_x, g_y$) is identically zero. In `currentForces` and `mixForce`, in-plane thermal buoyancy is strictly gated on `upright` (zero on a level plate, active on a tilted/vertical plate).
  2. **Linear Boussinesq:** Removed the artificial `tanh(20T)` clamp. For temperature differences of tens of kelvin, density changes are linear in temperature ($\Delta \rho = -\rho \beta \Delta T$), so buoyant acceleration scales linearly with temperature. Doubling temperature doubles plume acceleration (verified by `npm run heat` check 5).
  3. **Beer–Lambert spectral absorption:** The lamp heats the dish in proportion to how much light the dye absorbs. In `decayVel`, dye absorption is decoded using the plate's `lampThrough` Beer–Lambert model (`exp(-d.rgb / d.a)` per unit depth), so dark dyes absorb strongly while pale dyes and clear water stay cool (verified by `npm run heat` checks 1 and 8). The central lamp hotspot is modeled by the spatial shortcut $1 / (1 + 2.5 r^2)$.
  4. **Anchored physical units & Newton cooling:** Temperature is modeled in kelvin. The heating rate constant `LAMP_HEATING = 0.24` K/s is derived from physical irradiance absorbed in a thin layer: $I / (\rho \cdot c \cdot h) \approx 1000\text{ W/m}^2 / (1000\text{ kg/m}^3 \times 4184\text{ J/(kg K)} \times 0.001\text{ m})$. Newton cooling decays per-second with a real physical time constant in the tens of seconds ($\tau \approx 12.4\text{ s}$ via `heatDecay^(4*dt)`), remaining dt-independent across frame rates.
  5. **Oil buoyant density:** In `mixForce`, oil ($\rho \approx 0.85\text{ g/cm}^3$) is less dense than water ($\rho = 1.0$), so oil experiences upward buoyancy along the tilted plate while heavier wax sinks.
  6. **Temperature-dependent viscosity:** Water viscosity drops by ~2% per kelvin ($\mu(T) \approx \mu_0 / (1 + 0.02 \Delta T)$), causing thin-gap mobility under gravity to rise with temperature (~1.5× at 30°C).
  7. **CPU twin alignment:** `LiquidVisualizer.tsx`'s `stepCurrent` mirrors the GPU solver: `fy = upright * p.currentBuoy * Math.min(50, Math.max(0, this.temp[q])) + p.rockY * dd`, removing `tanh(20T)` and gating on `upright`.
- **Measured:**
  - `npm run heat`: 9/9 checks passing on Metal and SwiftShader.
  - Check 1 & 8: Dark dye heats to 0.0707 K in 0.5s under full dimmer, clear water stays at 0.0000 K; dark dye absorbs 12.95× more heat than pale dye of equal total density.
  - Check 2: Dimmer at 0 produces 0.0000 K; dimmer at 0.5 heats to 0.0353 K (0.500× linear scaling).
  - Check 3: 60 steps at dt=1/60s cool to 9.0703, 120 steps at dt=1/120s cool to 9.0625; ratio 1.0009 confirms dt-independence (per-step would diverge by 3.36×).
  - Check 4: Level plate produces 0.000000 in-plane vy; upright plate produces upward plume vy = 0.126343.
  - Check 5: Plume vy is 0.22839 at T=15 and 0.41284 at T=30; ratio 1.808 confirms linear Boussinesq scaling (tanh clamp would saturate to 1.10).
  - Check 6: Thin-gap terminal velocity increases from 0.12048 to 0.18945 at 30°C (ratio 1.572), matching the ~2%/K viscosity drop.
  - Check 7: Oil rises with vy = +0.00809, wax sinks with vy = -0.03311, level plate is 0.000000.

### 18g. Colour leaves by flushing, not by fading

**18g-1** (2026-10-11): flushing at the open rim (#362). On a thin gap, old colour leaves by being pushed over the circular open rim ($r \ge 0.5$) into the overflow trough as new liquid enters, mirroring 18d-2's species rim, and a still dish loses no colour through its rim (`evapFactor` 1). Base evaporation still fades colour inside the dish until 18g-3/18g-5, and the dye-budget regulator is preserved as a named safety cap pending 18c-2 (pours add volume) to prevent runaway saturation on looks that inject dye without volume. Measured in `npm run flush` (9/9). Open items 18g-2 to 18g-5 remain in `PLAN.md`.

**18g-6** (2026-10-24): the open rim holds the oil that touches it. Found building 27f-5: a body of oil against the rim drained out through it with the plate level, by its own surface tension. The thin gap's rim held the pressure at zero, the water's in the reservoir past the cover glass, in a cell of oil too, so the oil just inside the rim was at its body's Laplace pressure σκ and the rim's own cells at none. A real body cut by the rim has its interface past it, in the reservoir's water, and its oil there is at σκ. Now the rim is held at that pressure: `rimLaplace` integrates the capillary force along a ring two cells inside the rim, from its least oily sample (the water's zero), which across an interface is the jump σκ and inside a body flat, and `mixForce` takes the gradient of w(r)·φ(θ) off the capillary force over the last eight cells inside the rim. A gradient moves nothing between two glasses, so this is the same as holding the solve's rim at φ without touching the solve or the carries' faces, and short of the band the force is the same to the bit. The closed-dish circulation the item also offered (27f-5's way) would have been a second Poisson solve every step on every oil look. `npm run rimhold` (fifth shard): a lens of 0.06 against the rim at the middle of the grid's edge kept 9.6% of its oil over six seconds on main and 97.1% now, on the diagonal 99.0%; in their last three seconds the tension drains none beyond the weak-tension control's; at a hundredth of the tension, and in the middle of the dish, nothing changed; a pour still pushes oil out over the rim. `npm run oillift`'s own rim lens at the looks' tension keeps 98.5% (66% before); its half-dish sheet laid against the rim now settles off it in its first second, the picture's mean 0.31 mm/s for that second and 0.02 by the third, where before it drained through it at 0.14 mm/s while it lasted, and the frame the tilt adds is 0.05 mm/s against the bar's 0.15 (0.006 and 0.015 before, both runs of the difference now in that first second). `npm run physics` 20/20. Left: 18g-7 (a tension-free slow loss on the diagonal) and 18g-8 (the gap's own curvature, which decides whether a real body is drawn out under the cover's edge).

### 18h. Dye spreads along the flow (replaces isotropic diffusion and the conservation patch)

- **Where:** 4-iteration Jacobi dye diffusion with one constant for every colour (about 40,000× the
  molecular rate at the slider's top, measured 2026-10-11: a drop's rms radius 4.7 → 19 →
  37 mm at 0/5/20 s, D ≈ 1.7e-5 m²/s against food dye's ~4e-10; this said "about 1000×",
  which was a guess), and heat on the same number (Double Diffusion only multiplies it;
  water's κ is 1.4e-7, about 350× the dye's; heat previously shared the dye's number, leaving 12 looks with
  0 heat spreading); the MacCormack Jacobian clamp and neighbourhood cap (`fluid.ts` advection), which
  lose the excess; `sharpenDye`, retired (0 by default) but still in the step.
- **The real phenomenon:** molecular diffusion is negligible at this scale ($D_m \approx 4\times 10^{-10}\text{ m}^2/\text{s}$). The blur in
  a Hele-Shaw cell is shear dispersion along the flow. On show timescales ($t \ll h^2/D_m \approx 25\text{ hours}$ across a 6 mm gap),
  parabolic velocity shear $u(z) = 1.5 \bar{u} (1 - 4z^2/h^2)$ across the gap yields pre-asymptotic along-streamline
  spreading with variance $\sigma^2 \approx 0.2 \bar{u}^2 (\Delta t)^2$, rather than the long-time Taylor–Aris limit.
  Edges stay sharp where the liquid is still and streak along flow lines where it moves.
  Heat spreads at water's own thermal diffusivity ($\kappa \approx 1.4\times 10^{-7}\text{ m}^2/\text{s}$, Le $\approx$ 350).
- **What it takes:** a single explicit conservative finite-volume face-flux pass (`dyeDisperse`) with an anisotropic
  tensor $D_L = D_m + \kappa_T (h/h_0)^2 |v|^2$, capped at 0.25 cells²/step (the von Neumann positivity limit), with
  positivity-preserving cross-term limiting to prevent negative oscillations. Heat diffusion is decoupled from dye diffusion
  and handled in the viscosity stage with time accumulation (`heatSeconds`) to ensure FP16 precision survival on SwiftShader.
- **Cost:** single explicit pass (0.39 ms, 2.0% share), replacing 4-iteration Jacobi (1.3 ms), saving ~0.9 ms.
- **Shipped (#357):** replaced 4-iteration Jacobi dye diffusion with single explicit conservative
  finite-volume shear dispersion (`dyeDisperse`) with molecular diffusion $D_m = 4\times 10^{-10}\text{ m}^2/\text{s}$ and
  longitudinal shear dispersion along depth-mean flow; decoupled heat diffusion to real water thermal
  diffusivity $\kappa = 1.4\times 10^{-7}\text{ m}^2/\text{s}$ in viscosity stage. Checked by `npm run dispersion` (6/6).

### 18i. Bubbles and beads live by physics, not timers

- **What was reported** (PLAN.md §18i): bubbles live 9–23 s and pop on a timer; merges are a random dice roll (`rng < dt·0.12`), pairs are pulled together by an artificial long-range force, and drift has artificial Brownian wander. Real bubbles trapped between glasses are air pancakes with no draining soap film: they do not pop on a timer, experience no long-range attraction, and run ahead of the liquid flow due to lubricating wall films (Bretherton).
- **Physical models implemented** (`src/lib/bubbles.ts`, `src/lib/beads.ts`, `scripts/bubblephysics.mjs`):
  - **Bretherton lubrication speedup**: air pancakes in planar Hele-Shaw flow advance faster than depth-mean fluid velocity $U$, with speedup $U_b / U = 1.5 / (1 + 2.26\text{Ca}^{2/3})$ where $\text{Ca} = \mu U / \sigma$ is the capillary number. As flow speed increases, thicker wetting films on the glass plates exert more drag, dynamically reducing the speed ratio (~1.43× at $u=0.01$ down to ~1.33× at $u=0.04$).
  - **Zero unagitated wander & acoustic jitter**: unagitated millimeter bubbles have high Péclet number ($Pe \gg 10^6$) and experience zero Brownian wander in quiescent fluid (drift $< 10^{-5}$ cells in 2 s). Treble acoustic agitation vibrates the plates, driving isotropic 2D wander scaling continuously with sound intensity ($2.0 \cdot \text{agitation}$).
  - **Saffman-Taylor finger wavelength scaling on Straw**: rapidly advancing air fronts destabilize into fingers with wavelength $\lambda \approx \pi b_\text{eff} / \sqrt{\text{Ca}}$, producing lobe count $m \propto R \sqrt{\text{Ca}}$ strictly between [6, 18] clamps (7 vs 12 lobes across gentle vs fast blowing, theoretical ratio 1.715).
  - **Stefan-Reynolds / Chesters thin-film drainage**: bubble coalescence is governed by thin liquid film drainage rather than random chance. Drainage time scales as $t_\text{drain} = \text{DRAINAGE\_FILM\_FACTOR} \cdot (\mu / \sigma) \cdot R_e$ with effective radius $R_e = (r_a r_c)/(r_a + r_c)$ and $(R_\text{film} / h_\text{crit})^2$ geometry factor. Resting push-apart is maintained at $0.98\cdot(a.r + c.r)$ so resting foam rafts remain stable, while hydrodynamic compressive contact ($dist < \sqrt{0.92}\cdot(a.r + c.r)$) drains and merges.
  - **Bead viscous pancake lag**: oil drops in a thin gap lag the depth-mean flow: $U_\text{bead} / U = 2 / (1 + \lambda)$ for viscosity ratio $\lambda$ on `BeadField`.
  - **Timed pops available**: per the owner's call, timed pops remain available (`timedPops = true`) to pace shows via `lifeScale`, while physical pancakes (`timedPops = false`) live without timer pops.
- **Shortcuts honestly declared**:
  - **$1.5\cdot U$ premise**: Taylor-Saffman potential flow gives $2.0\cdot U$ for an inviscid bubble spanning a Hele-Shaw cell (matching $2U/(1+\lambda)$ at $\lambda=0$). Centerline velocity of planar Poiseuille flow ($1.5\cdot U_\text{mean}$) was retained as a tuned shortcut: real light show bubbles spanning the 6 mm gap with finite lubricating films and viscous liquid caps drift at ~1.35–1.45×, avoiding excessive bubble runaway that alters show pacing.
  - **$b_\text{eff} \approx 0.091\text{ cells}$ ($0.095\text{ mm}$)**: set in grid cells (moving with grid resolution), about $63\times$ smaller than the physical 6 mm gap (`DISH_REST_GAP * DISH_METRES`). If the physical 6 mm gap were used directly ($b \approx 5.76\text{ cells}$), $m \sim 0.5$ lobes—meaning a bubble on a 192 grid would never form more than 1 finger. $b_\text{eff}$ scales the finger count to produce 6–18 visible Saffman-Taylor lobes.
  - **$t_\text{drain}$ units and $\text{DRAINAGE\_FILM\_FACTOR} = 7200$**: in real units $(\mu / \sigma) \cdot R_e$ is viscous-capillary time (~1 ms). $\text{DRAINAGE\_FILM\_FACTOR}$ represents the $(R_\text{film} / h_\text{crit})^2$ term from Chesters/Reynolds lubrication theory to bridge to macroscopic film drainage times (~4–8 s).
  - **Viscosity $\mu$**: fixed at light mineral oil ($17\text{ mPa}\cdot\text{s}$) matching the show's carrier fluid, pending per-liquid coupling in 18d.
  - **$\lambda = 1.5$ on beads**: solved back from tuned $0.8\times$ flow speed.
- **Measured** (`npm run bubblephysics`): 11/11 checks pass. Foam stability test over 3600 frames on a resting raft yields 0 merges (stable foam).

### 18j. Milky liquids scatter

**Shipped** (2026-10-10, #353): milky liquids scatter light, turning milk into an opaque white body under diffuse backscatter and casting a warm dark projector shadow with a soft forward halo.
- **Where:** everything in the plate was previously treated as a pure absorber. `colourBody` pushed opacity and saturation up to imitate a body of colour, `granulation` modulated dye optical depth with noise, and milk was rendered as dye tinting.
- **The real phenomenon:** milk is an emulsion of sub-micron fat globules and casein micelles (~100 nm) that undergo Mie and Rayleigh-Gans scattering without significant intrinsic absorption in visible wavelengths.
  - *On black ground (diffuse backscatter):* multiple scattering produces a bright, white diffuse body. Modeled using non-absorbing Kubelka–Munk theory: $Sd = \mu_s' \cdot 6.0 \cdot d_{gap}$, $R_{KM} = \frac{Sd}{1.0 + Sd}$. Strictly energy conserving ($R_{KM} + T_{KM} \equiv 1.0$) with equal RGB scattering, giving pure white reflectance ($R=G=B \approx 98.8\%$ luminance). Absorbing food dyes sit on top of this white reflective substrate, creating vibrant opaque pastel tints (e.g. pinks/reds rather than dark mud on black ground, fulfilling PLAN §4).
  - *On lamp ground (projector transmission):* a projector collection aperture (f/2–f/4 lens) collects only unscattered or forward-scattered light within a narrow pupil angle ($\sim 10^\circ$). Over $90\%$ of scattered light misses the lens entirely. Consequently, milk casts a dark shadow (mean transmission $\approx 25.4\% \le 30\%$). Casein micelle scattering follows Rayleigh-Gans $\lambda^{-1.5}$ wavelength dependence ($\vec{\kappa}_{casein} = (0.85, 0.95, 1.20)$), scattering blue light more strongly than red, causing the projector shadow to appear warm/amber ($t_R > t_B$).
  - *Forward halo:* light scattered at small forward angles forms a soft forward halo around the pool boundary, glowing slightly above bare plate transmission (+0.46%) in an annulus just outside the pool core.
  - *Zero-scatter species (control):* liquids with zero scattering coefficient ($\mu_s' = 0$, e.g. glycerine, water) render byte-for-byte identical to the bare plate across all pixels on both black ground and lamp ground.
- **Conserved transport & packing:**
  - Optical scattering coefficient $\mu_s'$ is carried in the GPU species field (channel 2, `species.b`) and advected via the existing conserved flux-form pairing (`bodyAdvectPairSub`, PLAN 18d-11a).
  - Because `view0` and `dye` textures were full, $\mu_s'$ is packed into `vel.w` via `packVel` during velocity packing (`max(0.0, sp.b)` in `.w`), alongside temperature in `v.z` (PLAN 18f / #352) and clamped velocities in `.xy`.
  - Species channel 2 was traded from density $\rho$ (which is read by nothing yet in the solver) to avoid allocating an extra PingPong texture and doubling advection bandwidth, maintaining 18d-11a's 6.73 ms paired carry. When 18d-4 buoyancy lands, density can be packed or restored (PLAN 18d-4a).
- **Verification:** `npm run milk` enforces 9 automated checks including dark warm shadow, halo glow, white diffuse backscatter, dye-on-milk pastel reflectance, conserved species advection, and zero-diff glycerine control against bare plate.

### 18l. A dye has more than one colour (replaces the perfect filters and the three-dye rule)

- **What was reported** (the owner, 2026-10-04): "in general there just aren't enough
  colors in the presets. I want a lot of color subtlety between color gradients."
- **What was measured** (the lab, each look's own dyes on one seeded, sheared plate,
  rendered through the plate shader; distinct colours are 5° of hue by four steps of
  saturation and of value, each holding 0.1% of the lit pixels): three causes.
  - *Two dyes on the plate.* Most looks carried two or three dyes, from §10's "2–3 hues
    a frame", and the hue walk shows one fewer than the set (`harmonyFromContract`), so
    most looks had two dyes on the plate at once; a look without the walk drew three.
  - *Perfect filters.* `addDensity`, the splat records and the picture pour read a
    palette colour as the dye's transmission with a floor of 0.002, and half the
    palette sits on the gamut's corners, a channel at 0 and one at 1. That is a filter
    that passes all or nothing of each band, which has one colour at every depth
    (1ⁿ = 1, 0ⁿ = 0): each pool was one flat colour from rim to core, Transmission
    could only change its opacity (on Classic's plate, Transmission at 1 alone: 68
    distinct colours to 66), and a sixth of a blocking dye in a mixture killed a
    channel (the hue change bunched 43–51% into the outer fifth of a mix of yellow and
    hot pink, amber and hot pink, purple and blue, orange and red).
  - *A grade that clips.* The saturation grade (1.45 on most looks) clamped each channel
    on its own: with it at 1, Classic's plate showed 75 colours against 62, Velvet
    Underground's 79 against 57.
  - Not the cause: the gooey edge (no consistent change), and the mixing law itself
    (geometric mean of transmissions, which is the physics).
- **Shipped** (#281): the dye's absorbance is a real dye's, held between 4% and 96%
  transmission per band at one unit (`src/lib/dye.ts`, every place a poured colour becomes
  dye: drops, strokes, the picture pour, the CPU engine; a colour clear in every band,
  white, stays clear liquid; the bead drops' own lens colour in `plate.ts` already had a
  4% floor and keeps its own conversion);
  Transmission's default is 1, so the colour follows the dye's depth (Beer–Lambert:
  thin washes pale, deep pools saturate and their hue shifts, a deep yellow amber, a
  deep pink crimson); 27 of the 41 looks carry five to seven dyes as a family of
  neighbouring hues and an accent, and five are on the plate at once (`WORKING_DYES`,
  `dyesOnPlate`); the grade pushes
  along the line from grey and eases in before the gamut's edge, so it keeps the hue.
  What that push cannot give, a second push about the brightest channel gives (the
  others spread from it as far as the old clamped push spread them, easing in before
  the dimmest reaches 0; spread by the whole push, a faintly tinted white paper went
  pink and `npm run benday` read 20% white where it asks 60%), so a colour already at
  the edge is still deepened and the hue still kept: without it the glints at the feet
  of Magnet Garden's domes stayed bright and `npm run spikes` failed on the Mac (16 tops
  lit against 4.0 places off them in the lab, 0.5 on main and with the second push).
  Ink lays 0.3 a drop where it laid 0.25: with a red that is no longer a perfect filter,
  a drop of Cherry Red into a yellow plate read 1.48 times as red as green against
  `npm run plate`'s bar of 1.5 (that check now uses the app's conversion, not its own copy).
  The Slow Build sequence opens on one of Classic's dyes, then three, then five. The phone
  draws the same plate and palettes. `npm run colours` (CI, open shard) holds
  it (9 checks; 2 of them pass on the old plate, the presence ones): most looks five dyes
  or more and five on every six-dye plate, six dyes strictly paler thin and more
  saturated deep (old: 0.95/0.99/0.98 for yellow, now 0.69/0.96/1.00), a pure blue
  letting 4.2% of red and green through (old 0.2%), a deep yellow toward orange from the
  depth, four neighbouring pairs walking (net hue change in the outer tenth at each end
  39–48% of the whole on the old dyes, 25–28% now, at most a third asked), the grade
  within 3° of hue at the 95th percentile (old clamp 6.2°, now 0.3°).
  Left as they were: Velvet Underground, Lumia, Cell Bloom and the Fillmores (areas of
  their own, "More going on in every look"), Sensual Laboratory (on the lamp, #262),
  Clock Glass and the ferrofluid looks (their own pass), Roy's three inks, and the looks
  whose liquids or chemistry make the colour. Judging: docs/judging.md §37 (the owner's eyes
  on every look, on the Mac).
  `npm run mixer` read the back plate's dye as the pixels adding it at full level moved;
  a deep pool of a dark dye now draws near black and adding it moves nothing, so 150
  covered pixels read as bare glass and Multiply darkening them (77 steps) failed the
  check. The footprint is now also read from the plate drawn flat (Transmission 0, same
  coverage): worst 0 off the dye, 68/68, bounds unchanged.
- **Across the looks** (the survey above, every look before and after, its own dyes,
  as many as its plate shows at once): the 27 widened looks went from a median of 65
  distinct colours and 19 hue bins to 101 and 25 (Classic 65 → 100, Galaxy 27 → 72,
  Stardust Collapse 21 → 127, Soap Film 63 → 136); the 14 left alone from 54.5 to 62.5,
  from the dye and the grade alone.

### 18m. A drop slumps under its own weight (replaces a drop that sits or blurs)

- **What was reported** (the owner, 2026-10-11): "I don't feel like we have dye and
  other diffusion through clear water."
- **What was measured** (the audit, lab, a 1 cm drop on a still thin-gap plate): at
  Diffusion Rate 0, as twelve looks have it, the drop did not move in 20 s (rms radius
  4.69 → 4.70 mm); at the slider's top it blurred into a Gaussian at D ≈ 1.7e-5 m²/s,
  about 40,000× food dye's molecular rate (18h's "about 1000×" corrected). Neither is
  what ink does: molecular diffusion would move it under 0.01 mm in 20 s. What spreads
  a drop of food colouring is its weight (its glycol makes it a percent or two denser
  than water): it sinks to the lower glass and runs out under the clear water as a
  viscous gravity current, a flat pool with a sharp front, r ∝ t^⅛ (Huppert 1982).
- **What was built:** `wgsl/slump.ts`, a stage of its own in the dye's step (apart from
  18h's 'dye diffuse', which Antigravity is replacing). The dense layer's flux between
  two glasses, with no slip on both, no net flux through the gap and equal viscosities,
  is q = −(g′/3ν) η³(1 − η/b)³ ∇η (derived for this, the same as Zheng, Rongy and Stone
  2015): Huppert's current while the layer is thin against the gap, choked as it fills
  it. The depth is the dye's amount × DYE_LAYER (0.36 mm a unit: the lab's drop is a
  0.05 mL drop from a dropper), Δρ is Dye Weight's contrast (2% to 15%) times the dye's
  strength (its strongest band per unit over a full-strength dye's; white, clear liquid,
  weighs nothing), the current runs in the water's share of a cell, and cos θ of g on a
  plate stood up. Explicit, in flux form (no dye made or lost), colour carried upwind,
  K worked out once a step, up to six substeps with each face held to 0.24 of its
  difference (18m-1 names the cap). On the default Thickness (a light oil, ν 2.2e-5)
  that is two passes and a drop spreads slowly; in water seven, and it runs.
- **Measured** (`npm run slump`, lab, 256², a 0.05 mL full-strength drop in water,
  before the check's controls were added): front 3.94 mm → 6.6 (1 s) → 8.0 (5 s) → 9.6
  (20 s) → 11.25 mm (60 s), against Huppert's 6.54, 7.99, 9.51, 10.91; growth t^0.125
  from 5 to 30 s; the edge 0.886 (half-peak radius over twentieth-peak; a Gaussian
  reads 0.48); Dye Weight 1 ×1.266 further at 20 s against the law's ×1.286. A numpy copy
  of the kernels at 768² (the cap binds harder there) reads 10.96 mm at 60 s. The
  before and after pictures are in the project's files (`diffusion/`).
- **Found along the way:** the grid's checkerboard filter (`dampGrid`) added dye at a
  drop's rim, 3.2% in 20 s (fixed in **18m-5** below).

#### 18m-5. The grid filter makes dye at a drop's rim (shipped 2026-10-25)

- **Reported:** 2026-10-20, found while building 18m (`scripts/slump.mjs`). `dampGrid` takes
  the grid's checkerboard out of the dye with the 5×5 high-pass filter `f' = f − s·K(f)`,
  `K = k⊗k/256`, `k = [1 −4 6 −4 1]`, and clamps each cell to the range `[lo, hi]` of its
  3×3 neighbours so the negative lobes of `k` cannot ring past a hard edge. That cell-wise
  clamp is not conservative: at a drop's rim on an empty plate (`f = 0` outside), `−s·K(f)`
  is negative just outside the rim and positive just inside it; the clamp cuts off the
  negative undershoot at `lo = 0` outside while keeping the positive lobe inside, making net
  dye every step.
- **Measured on main** (`7d77141`, 256², a 0.05 mL drop in glycerine, `gapThickness: 1`,
  `solutalBuoyancy: 0`, `diff: 0`): with `gridDamp` off, dye total `231.13` (`+0.000%` at 2 s
  and 20 s), front `3.94 mm` → `3.94 mm` (2 s) → `4.50 mm` (20 s). With `gridDamp` on, dye
  total `231.13` → `233.27` (`+0.926%` at 2 s) → `238.53` (`+3.202%` at 20 s), front
  `3.94 mm` → `4.13 mm` (2 s) → `4.66 mm` (`+0.72 mm` at 20 s).
- **Why not face-by-face third-difference flux limiting:** writing `K(f) = (1/256) δx⁴ δy⁴ f`
  as the divergence of face fluxes `Fx = δx³ δy⁴ f`, `Fy = δx⁴ δy³ f` and limiting each face
  with Zalesak's limiter fails `pressed` in `npm run grating` (`68.7%–69.0%` worst channel vs
  `< 68.0%` bar). A third difference is non-zero on a smooth wave whose fourth difference is
  nearly zero, so scaling a cell's two opposite faces by different neighbour factors breaks
  the cancellation `F_{i+1/2} − F_{i−1/2}` and traps that through-flux inside the cell as
  grid-scale ripple.
- **What was built:** a three-pass filter (`dampGridCurv`, `dampGridLimit`, `dampGrid` in
  `src/gpu/wgsl/fluid.ts`, dispatched by `src/gpu/fluid.ts`) that evaluates the full
  fourth-difference update `u_p = −s·K(f)_p` first (with half-sample reflection `reflect1`
  across the grid walls so the stencil matrix is symmetric with zero column sums and 1-cell
  lines and rows stay invariant), clamps each cell to `c_p = clamp(f_p + u_p, lo_p, hi_p)`,
  and returns each clamped cell's excess `e_p = c_p − (f_p + u_p)` back across the 7×7
  neighbourhood (`-3..3`) weighted by each neighbour's room `w_p = min(c_p − lo_p, hi_p − c_p)`
  to its local bounds. The return window is 7×7 (`-3..3`) rather than 5×5 (`-2..2`) because the
  5×5 filter clamps a two-cell-wide band at a steep drop rim (`room = -1`), so a 5×5 return
  window leaves the inner rim cell short of unclamped neighbours (`+0.028%` at 20 s on the
  glycerine drop vs `+0.000%` with 7×7). Because `w_p > 0` only where `e_p = 0`, clamped cells
  take none of their own excess back and receiving cells stay inside `[lo_p, hi_p]`. On the
  four opposite neighbour pairs, `hi` is gated by the one-sided numerical rule
  `6.0 * (here − mn) > mx − here` (where `6` matches the central stencil weight `k_0 = 6` of
  `k = [1 −4 6 −4 1]`): the plain 3×3 max blocks the distance-2 overshoot ring (`k_{±2} = +1`)
  but lets the distance-1 weight (`k_{±1} = −4`, `+4s/256 > 0`) diffuse dye one cell outward
  into a dry toe (moving the glycerine drop's front to `4.13 mm` at 2 s and `4.66 mm` at 20 s).
  Across gate factors `4.0`, `6.0`, and `8.0`, the glycerine drop holds `231.13` (`+0.000%` at
  2 s and 20 s) with its front at `3.94 mm` (2 s) and `4.50 mm` (20 s), and `pressed` reads
  `65.91%`, `65.96%`, and `65.95%`. The 3×3 neighbour box mirrors across grid walls with
  whole-cell reflection `mirror1` (`−x` and `2n − 2 − x`) so `macCormack`'s wall-clamped outer
  ring does not set `nW = here` (`here − mn = 0`) and trip the one-sided `hi` gate along the
  wall (`+5.51 ppm/s` with `reflect1` on the 3×3 box vs `+0.42 ppm/s` with `mirror1`). The
  `OPEN_RIM` under `thinGap` guard is unchanged.
- **Measured after:** glycerine drop with `gridDamp` on holds `231.13` (`+0.000%` at 2 s and
  20 s) and its front matches `gridDamp` off (`3.94 mm` at 2 s, `4.50 mm` at 20 s).
  `npm run grating`: all 24 checks pass (1 step `94.6%`, 1 s `4.2%`, spread `29.7%` / `6.9%`,
  pressed `66.0%` `< 68.0%`, 1-cell lines/rows `0.000%`, disc ring `0.002%`, halo `0.4%`,
  conservation `+0.42 ppm/s` against `+1.47 ppm/s` on `main`, bar `< 10 ppm/s`).
  `npm run stages` (768², 2 layers, `apple` / `metal-3`, two alternating pairs): `dye grid`
  goes from `1.54 ms` / `0.63 ms` (`3.4%` / `1.4%` of L0) and `0.81 ms` / `0.77 ms`
  (`3.8%` / `3.5%` of L1) on `main` to `3.41 ms` / `3.76 ms` (`7.1%` / `7.5%` of L0) and
  `1.99 ms` / `2.33 ms` (`8.5%` / `9.5%` of L1) on this branch.

### 19aa-3. The API scripts never print the token

**Shipped** 2026-10-19. A transient 502 from the Actions API stopped `npm run flakes` on
the owner's machine, and the error it died with printed the owner's GitHub token whole.
`flakes.mjs` and `macqueue.mjs` handed the token to curl as an argument
(`-H "Authorization: Bearer …"`), and a failed child process's error in Node carries the
whole command line in its message and in `cmd` and `spawnargs`; a top-level await that
rejects prints all of it. The argument was also readable by any process for as long as
curl ran. Both now go through `scripts/ghapi.mjs`, which gives curl the header on its
standard input (`-K -`), so the command line holds nothing to print, and rebuilds every
error from curl's exit code and its stderr with tokens of any GitHub shape, and the
environment's own by value, taken out. `npm run ghapi` (Measure, logic part), against a
local server that answers 502 and echoes the header back: the header still arrives;
the arguments hold no token; the async and sync errors, printed every way Node prints
one, hold none, and both are new errors without `cmd` or `spawnargs`; curl's "error: 404"
line, which `flakes.mjs` reads to tell an expired log from a failure, survives; a token in
the URL is taken out of both errors, and with the redaction bypassed the same calls leak
it; and the old way on the same server leaks it and the same assertion sees it. 10/10.
The check-skeptic's mutants: `failure` without its redaction fails the URL check, and the
sync wrapper rethrowing Node's own error fails two. `deploygate.sh` still puts the header
on curl's command line, readable through `ps` while it runs on the owner's machine:
19aa-4.

### 19aa-6. The renders lines on a starved runner

Shipped 2026-10-24. Three `npm run renders` lines went red on 8 of 191 Mac runs each in
the week to 10-24 (`npm run flakes`). The laptop's band lines ("the ear is reading", "the
plate hears a new reading on four frames in five") failed in the first of their two
3 s windows every time, with the plate drawing 0.0, 1.7, 1.9, 9.9, 10.8, 12.2, 13.6 and
14.5 frames a second there and 16.5 to 28.4 in the second: five seconds after load the
page was still opening on a cold runner (the open shard runs startup first, which empties
the Mac's shader cache). Each page now waits, a second at a time and at most thirty,
until one second holds fifteen of the plate's frames (the 45 in 3 s the lines ask), as
squeeze.mjs does for its steps; a plate that never gets there is still measured and
fails, and the wait is printed when it is more than a second and a half.

The phone's fader line, "the plate's Dimmer moves at least twice as often as the desk's",
failed with the page drawing 14.6 to 22.5 frames a second and the Dimmer changing on 93
to 100% of them: twice the desk's 9 to 10 a second is more changes than frames below 20
a second. It now asks the claim itself: a change on nine frames in ten that were offered
a new value (the watch counts the frames whose newest message differs from the last
frame's), and a quarter more than the desk's (a plate fed by React changes at React's 7 to
10.5 a second, which fails both at any frame rate the line allows). The first version
asked four frames in five of all drawn; its review read 48 green windows and the Dimmer
changed on 0.79 to 0.99 of the frames drawn, lower the faster the frames come, because
the stub's 60 Hz timer beats against the frames and some have no message to draw. On the
Mac the new ratio read 1.00 in all four windows (28.5 to 34.9 offered a second).

### 19aa-8. The Blow's push follows the solver steps

Shipped 2026-10-25. The numbers and the stroke's new pace are in `scripts/tools.mjs`
(`windRun`) and PLAN.md §19aa-8: the push correlates 0.73 with the wind steps over 28
Mac strokes, and nine strokes of one Mac run at 750, 1500 and 3000 ms of waiting read
+0.46% to +2.97%, 45 to 112 wind steps, no straw step.

### 19ac-1. The double tap's two taps carry a finger's times

Shipped 2026-10-24. `npm run phone`'s "Play: a double tap on Speed puts it back to the
look's own speed" was red on 10 of 173 Mac runs in the week to 10-24, 5 of them green on
the same commit, every one reading `0.009 → 0.28 → 0.005`: both taps landed (0.005 is
Speed at a third of the track) and the second was not taken as the other half of a double
tap. `TouchSlider` reads a double tap from the two lifts' `timeStamp`s, at most 320 ms
apart, which on a phone are the finger's times. Playwright's `touchscreen.tap` stamps
none, so Chromium stamps each event when it reaches it, and the second tap is sent only
once the page has handled the first: in a plain page whose pointerup kept the thread
busy, two such taps 60 ms apart read 95 ms apart idle, 217 ms busy 150 ms and 466 ms busy
400 ms; the same taps sent with their own times read 80 ms apart busy 400 ms. So the
check measured how quickly the page answered the first tap, which a finger never waits
for. The taps are now sent through `Input.dispatchTouchEvent` with times 90 ms apart; a
second tap is sent no sooner than 0.4 s after the first, past the window, so the line
passes only if the stamps are what the app reads, and no stamp is ever in the future;
both lifts must reach the app within 15 ms of their stamps, so a red names the instrument;
and a control stamped 0.6 s apart must leave Speed where one tap there puts it. The line
prints how far apart the app handled the lifts (the page's own lag, which no check bounds
for the phone's sheet yet: 19ac-2).

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

**Shipped: Roy opens as a panel, not a black stain.** The owner, 2026-10-04, over a
screenshot nine seconds in: "The Roy preset always starts with this giant black stain.
Get rid of it. It needs to look more like an abstract colorful Roy Lichtenstein
painting." The stain was the look's seed: `splatBlob` takes its radius in the 128 grid's
units and scales it itself, and Roy's seed handed it cells, so its four pools came out
four to five times too wide, lay over each other across the whole glass, and three inks
over each other print black. The seed is now a laid-out panel in the plate's view: seven
flat shapes and three brushstrokes of the three inks, apart on white paper, and four
even fields of pale wash at the strength each ink prints as Ben-Day dots (measured per
ink, a narrow band: blue about 0.1, yellow and red about 0.12). Dye Budget 0.9 → 0.45, so
the drops cannot fill the plate back into one wash (inferred, 21e). `npm run royopen`
lays the app's own seed and prints it in the lab: on main 71% of the plate absorbing all
three channels, the view 57% black, 37% red, 0% white, yellow and blue, 16 dots, mean
3.69; now 0.1%, 9.9% black, 57% white, red 12.8%, yellow 6.8%, blue 9.8%, 254 dots, mean
0.115. The phone lays the same seed (it is the plate, not a control).

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


### 25h. Areas that listen for themselves (shipped)

The owner, 2026-10-24: the presets want more complexity, more varied palettes and parts of
the canvas reacting to the music; of the four directions explored that day, all taken, this
one first. Areas already took the music's hands by band, but every patch cord moved one
number for the whole plate and every area drew on one palette.

- **A cord aimed at an area** (`SceneMapping.area`, an index into the look's areas) does one
  of four things a hand does to one place (`lib/areaCords.ts`): **Heat here** (heat in
  kelvin, 1.5 K/s at full, carried and cooled as the lamp's is; 25h-1 names that it opens no
  hole until 18f-2), **Stir here** (a paddle drawn round the pool: the Finger's own solid on
  a thin gap, one turn in 1.2 s, turning back on each hit of a gated cord), **Pour here**
  (the area's bottles, 1.5 of density a second, under the look's fill as the music's pours
  are) and **Bottle here** (which bottle pours next). A setting is one number per plate, a
  uniform in the shaders, so an area takes the four acts and nothing else; the patch bay's
  fold leaves an area cord alone. Every act eases to nothing over the area's rim.
- **A gate on an area cord**, the least of 30a: a threshold (closing 0.05 under it, so a
  reading dithering on the line is one hit), an attack and a release, linear, so the
  envelope reaches a hit's height in the attack and falls from it in the release. None of
  the three set, the cord follows its reading as every cord did.
- **A colour family per area** (`PlateArea.dyes`). Absent, the family is the area's dye and
  the next, which is what its pool's second colour and the Color route's cycle already took,
  so Lumia and Cell Bloom lay and play as before. Velvet Underground's contract grew to six
  (lavender, coral and purple after its three), one pair per pool.
- **The looks.** Velvet Underground: the kick warms and stirs the soap well, the mids fold
  the glycerine with a slow paddle, the hats pour the syrup's two bottles in turn. Jellyfish
  Bloom (25b-6): its four bells are areas now and its seed lays them there (`OWN_SEED_AREAS`;
  they were scattered at random), the kick pours the lowest bell's pink and teal, the hats
  ruffle the top bell, the brilliance band picks its bottle (for the treble's sparks that land
  there: the music's own hands in an area read its Bottle cord, `AreaHands.picked`, which the
  first build left to the area's pour cords alone, and that bell had none), the mids pour the
  side bells.
  Bass Drop (25b-3): three soap wells on the bass, taken in turn by the kicks, Center
  Gravity 0.4 → 0.15; the snare stirs the low well and the sub warms the left. Preset depths
  stay at 0.6 or under, the most a one-second look change crossfades within `npm run desk`'s
  0.03 a tick.
- **The panel.** On a look with areas each patch gets an area picker over a thumbnail of the
  plate (`components/phone/AreaPicker.tsx`, the areas drawn where they are in their
  families' colours, 40 px targets for a thumb, the same sheet on the phone), and an area
  cord gets the gate: Fire on a hit, Gate, Rise, Fall.
- **Measured** (`npm run areacords`, the lab on SwiftShader, Velvet's pools on a thin gap,
  laid through the app's own sink, each run against a control of the same plate with no
  cords): one band's cords on the soap well changed the dye there 2×10⁵ times what they
  changed outside every area and kept 1.946 of the 1.967 of density poured there, the flow
  13.6x, and the heat 1.302 K on the run's mean of 1.310 K laid, against nothing outside;
  with two areas on two bands, band 2 worked the well 773x (dye) and 17.4x (flow) more than
  the syrup, and band 7 the syrup 286x and 18.4x more than the well; each gate opened once a
  burst (8 of 8). The flow held to the paddle's own arithmetic (the review): 0.090 cells a step
  meaned over the well, on 0.016 that the paddle's solid laid there and a paddle going 0.337
  round its circle (the floors half and a tenth); with the paddle cut to a cell across (0.05 of
  the area) the well went 0.006 and the check failed, where the ratio alone had passed. In
  node, a hit that grows after the gate opens ends at 0.887 for 0.9 (0.500 with the height
  untracked), and two cords alike keep a gate each. In node, a gate opened 14 times for 8 bursts and 6 stretches dithering on
  its line, where reading the line alone opened 51; rise 0.250 s for 0.25 and fall 0.333 s for
  0.35, for a hit of 0.9 and one of 0.5. The 25e
  count of lit places, each look played by its own cords for four seconds of a groove with
  every act in the plate's middle (where the music landed before areas) and then in its
  areas: Jellyfish Bloom 1 → 3, Velvet Underground 1 → 1 (its cords pour in one pool; the
  other two are stirred and warmed), Bass Drop 0 → 0 (its cords pour nothing; its wells take
  the music's own hands, 25h-7).

## 26. A reaction that prints: Turing stripes in black and white

### 26a. Gray–Scott on the GPU, carried by the flow (#327; carried once since 26d)

#327 moved the reaction onto a compute field at the dye's grid (`grayScott`, rgba16float:
u, v, the poured reagent, its pattern) and carried it with the dye's own scheme in the
step. It also ran a second, semi-Lagrangian carry of a frame's displacement in
`stepChemistry`, so the stripes ran ahead of the colour they laid (a pour of reagent and
a pool of dye laid together, stirred: the reagent went 17.7% of the plate to the
colour's 9.2%) and the bilinear backtrace blurred them a cell a frame. 26d took that
carry out (8.9% and 9.2%, 0.3% apart, `npm run turing`) and added the field to the
maze's carry, which had left it standing.

### 26b. The pattern as a control (#327; Width in plate units and the phone with 26d)

Pattern moves feed and kill along Pearson's map, 0.03/0.055 to 0.04/0.06; Width scales
the diffusion lengths. The lengths were in cells, so a stripe on 256² was twice the
plate's width of one on 512² (4.64% against 2.37%), and Width's top half drove the
explicit step past its stability limit (D·dt ≤ 1/4) into static. Now they are given on
a 384² reference grid and scaled by (N/384)², each unit of time cut into as many
substeps as D needs: 3.06%, 3.12% and 3.19% at 256², 384² and 512². Pattern, Width and
Turing Print are MIDI-learnable and on the phone's Looks sheet when a look runs the
reaction (26b had shipped without the phone).

### 26d. The look: "Turing Print"

A CIMA dish under a white lamp: the gel stands in the reagents (Chemistry 1, the bath)
with starch in it (`turingPrint`). Starch is what shows a CIMA pattern, and by holding
the activator back it is what lets one form (Lengyel and Epstein, 1991); the blue-black
complex forms and comes apart in well under a frame. So with the print on, the deposit
does not pile colour up for the flow to carry off: it sets the dye, where the reaction
is fed, to the complex's equilibrium with the activator as it is now, through a Hill
curve (iodine binds into amylose cooperatively; n = 6, half bound at v = 0.2, the
labyrinth's median), at a depth that is black on the lamp. Rendered in the lab: 56% dark,
34% light, 9% in the middle tones; darkness against the activator cell for cell 0.94;
the dark share 56.47% and 56.49% thirty frames apart.

Found on the way and fixed with it: the deposit read the field as if it were on the
logical 192² grid (it was, when the reaction ran on the CPU), so it drew the field's
top-left corner stretched 1.3 to 2.7 times over the plate and away from where it grew
(the same render's correlation with the field: −0.007). The coral looks now grow a
pattern half the size they showed, where it grew.

`npm run turing` measures all of it; its five controls (the logical-grid read, the
second carry, diffusion in cells, the print off, a reaction fed everywhere) each turn
their line red.

The first Metal run found one more: the stripe widened with the rung on the Mac's GPU,
3.08%, 3.35% and 3.51% of the plate at 256², 384² and 512² (14% apart, against the
check's 10%), where SwiftShader drew 3.06%, 3.12% and 3.19%. The reaction's field was in
half floats, whose step just under 1 is 1/2048, so the substrate's last refill (feed ×
(1 − u) a step) rounded away while the dish was still short; the Mac rounds a stored half
float toward zero and dropped more of it than SwiftShader, which rounds to nearest. The
lab, rounding the stored field toward zero by hand on SwiftShader, drew 3.08%, 3.35% and
3.52%: the Mac's widths. The field is now in the dye's format (full floats wherever the
GPU can filter them), and `npm run turing` asks first that the dish under the bath fills
to within 0.001 of its reservoir: half floats left it 0.0039, 0.0029 and 0.0051 short on
the three rungs, full floats 4.4e-6, 4.4e-6 and 5.0e-6 (the widths 2.98%, 3.08% and
3.15%). Half floats stay on a GPU that cannot filter
full ones (26d-5).

**26d-3. Other colour in a fed print (shipped 2026-10-19).** The owner reported that
poured colours do not work on Turing Print and that it cannot be a different colour.
Both were in `depositChem`: on every fed cell it wrote the print into the solver's own dye,
replacing whatever was poured there (fed cells are most of the plate), and the print's
colour was `TURING_PRODUCT`, starch's indigo, whatever was asked.

The print is now laid over the dye in a texture of its own (`printDye`), and the dye
the plate reads is that texture while a print is on (`fields.dye`), so the plate shader
did not change. The solver's dye is not written while it prints, so the pour moves and
fades as it would without the reaction, and when the reaction ends (`endPrint`) the plate
goes back to it. The print's colour is the `turingInk` setting: 0 is starch (every saved
look), above 0 a hue round the wheel at full strength (`src/lib/turingInk.ts`). The
plate reads the print's rgb as a colour at a density of 1.6 under multiply, so a hue at
starch's depth prints black with a thin rim (measured: a green at 0.12, 0.48, 0.12 printed
black, its darkest fifth at 0.05 of the white; 0.05, 0.95, 0.05 printed a solid green at
0.79). The ink is on the Perform desk's lamp pins, the phone's Settings rail, the remote,
MIDI, and fades as a choice at the midpoint (`lookFade.ts`), not as a hue sweep.

`npm run turing` lines 6 and 7: a red pool poured under the print raises red over green
on the pool's light paper from 1.01 to 22.97 (old code: 1.01, the pour erased); the print
is still there inside the pool (correlation with the undyed picture 0.983, against
-0.019 read five pixels along); the print takes a green, a blue and a red solid (0.79,
0.78, 0.80 of the white, 99.8% to 100% in that channel). The ink checks measure the ink
function's depth; that the visualizer hands the setting to it is read from its source.
The lab's render now takes the dye as the app does (`fields.dye`), so the lab draws the
print over the pour (a check input; named in the PR).

Review of the first push found two things, both from the print leaving the solver's dye.
The drain and the wipe at its end are the frames the visualizer's deposit does not run, so
a live print held its last picture still over the draining pour for fifty frames and then
jumped to the emptied plate; `drainStep` and `clear` now end the print (`npm run turing`
line 8 fails without it: the plate still read the print after a drain step and after the
wipe). And the look changes beyond its colour. Pours now pile up under the print, and
`readbackAsync` (so the dye budget's regulator and the scene reading) still measures the
solver's dye, which no longer holds the print. Measured on the shipped look in the lab
(60 and 180 frames of a pour every 15 frames, the print refreshed each frame): the solver
dye the regulator reads was 1.06 and 1.07 before (the print itself, always over the 0.35
budget, so every pour was held off) and is 0.08 and 0.21 now (the pours); the share of the
plate's pixels under a quarter of its white was 58% and 58% before and is 63% and 71% now,
the mean over white 0.35 and 0.36 before, 0.30 and 0.22 now. That is the colour the owner
asked for showing and darkening the paper under the stripes, not a regression, and the
regulator was deliberately left on the pours: reading the plate would count the print and
hold the pours off again. Whether 0.35 of pours under the print is too dark is judging §46.

**26d-6. The print keeps evolving (shipped 2026-10-19).** The owner said the Turing Print
"doesn't do anything that interesting once the chemicals come together". It was the
chemistry: Gray-Scott with one feed and one kill has a steady stripe state, so the maze
settles and only creeps (in the lab, a settled maze correlates 0.972 with itself 3000
units on and 0.901 after 9000, fifty seconds of a show at the app's 180 units a second).

The `grayScott` shader now varies the feed across the plate and in time, as the sum of
three plane waves with periods of 40, 65 and 90 seconds, scaled by the new `turingDrift`
setting (0, the default, is today's fixed map; the Turing Print preset sets 0.7). The kill
moves with the feed along the saddle-node curve `k = sqrt(F)/2 - F`, where the reaction's
non-trivial state vanishes: moving F alone carries a region across it (all substrate, or
all activator), and keeping k's distance from the curve keeps a region a pattern while
its stripes rearrange. The clock is the visualizer's own seconds (`sixtieths / 60` a
frame), so it runs with no music and the sound does not move it; nothing moves the whole
plate. `turingDrift` is on the Perform desk's lamp pins, the phone's Settings rail, the
remote and MIDI, and is left out of Evolve's random nudges (Evolve changes the print's look,
and this is already a slow clock of its own) and out of Lucky.

Named shortcuts: the map is three plane waves, not a noise field, so the regions are broad
diagonal bands; the curve is the saddle-node line, not Pearson's regime boundaries, so
how far k can follow F before the pattern changes kind was not mapped; the clock is
fixed-rate and follows no music.

Measured (`npm run turing` line 9, a 256² maze settled 9000 units, then 9000 more with
the same seeds): correlation with its settled self 0.901 at drift 0, 0.671 at 0.7 and
0.497 at 1; the share of cells with activator over 0.1 is 0.706, 0.694 and 0.686, and the
stripe wavelength stays within 3% of the control's (2.96, 2.98 and 2.99% of the plate). The
first constant, 0.012 a unit of drift, moved it too gently and became 0.02.
A soft grey patch opens at 1, where the map pushes the pattern toward a bare plate (the
flattest 32-pixel tile keeps 0.84 of the control's contrast at 0.7 and 0.76 at 1), so the preset sits at 0.7 (judging §55 asks the owner's eye on it).

**26d-6a. The grey patch and the stripe-to-spot glide (shipped 2026-10-20).** The grey
patch had a cause: the shipped point (F 0.04, k 0.06) sits exactly on the saddle-node curve
`k = sqrt(F)/2 - F`, so the drift's excursion in k carried some regions under it, where
the reaction has no non-trivial state and the plate is flat grey. The shader now picks the
distance above the curve, `d = k - curve(F)`, and keeps it positive: a quarter of a cap
for stripes, nine tenths of it for spots. The cap is the largest d that still holds a
pattern, and it shrinks as F rises (the lab's sweep, 256², 6000 units, 60 seeds: spots to
d 0.006 at F 0.03, 0.004 at 0.04, 0.002 at 0.05, under 0.002 at 0.06), so it is the
straight line `0.0105 - 0.15 F` through those. A second map of three plane waves (50, 80
and 120 s) moves each region between the two ends, and the drift setting scales how much of
that range the plate uses.

A sudden step between the two ends collapses the plate (stripes, then nearly empty, then
slow regrowth as spots); the same move over about 33 s is smooth, which is why the glide
is on slow waves. The Drift setting itself is subject to the same thing: handed to a
settled print in one step at 0.7, a 32-pixel tile where the feed falls goes dead (mean 0)
for about 3500 units, 20 s. A preset load or a slider jump is such a step, so the visualizer
slews the Drift it hands the solver at 0.025 a second (`TURING_DRIFT_PER_SECOND`; the
setting itself still moves as it did) and the print that is off starts the next one from 0.
Not a control, so no phone change.

Named shortcuts: plane waves, not a true noise field; the cap is a straight line through
a sweep, not Pearson's full regime boundaries; k ignores the look's own k while the drift
is on; the clock is fixed-rate and follows no music; every number is the lab's (SwiftShader),
none yet Metal's.

Measured (`npm run turing` line 9, same seeds and stepping as 26d-6): correlation with the
settled self 0.901 at Drift 0, 0.641 at 0.7 and 0.591 at 1 (0.867 and 0.814 through the
shipped #413 shader on the same ramp); the flattest 32-pixel tile over six reads, looked
for every 16 pixels, keeps 0.93 and 0.77 of the control's contrast (0.95 and 0.89 on the
first grid of whole tiles; 0.81 and 0.74 through the #413 shader on that grid and the ramp;
stepped, not ramped, Drift 1 left a dead tile and measured 0.20); stripe wavelength within
1.5% of the control's; the share of cells with activator 0.706 for held stripes, 0.483 for
held spots, 0.55 to 0.58 for the drifting runs; connected pieces of activator 14 for held
stripes, 389 and 374 at the last read of Drift 0.7 and 1, 608 for held spots (the #413
shader: 12 and 16).

Check changes: the alive-share bar (within 0.05 of the stripes' share alone) became a band
between a held-spots plate's share and the held-stripes plate's, each with 0.05 of room,
since spots cover less of the plate by design; Drift 1's tile contrast is now asserted
(it was shown); a new line counts connected pieces of activator and wants the drifting
runs and a held-spots control to show over ten times the held stripes' pieces. Drift 1's tile
contrast and the alive share are tested at every one of six reads, not the last; the held
spots' share and cap are read from the shader, so the check follows it; the lab now ramps
Drift at the rate it reads from `LiquidVisualizer.tsx`, as the app does, which is a change
of input, and the wiring check wants the slew in the visualizer. The ramp is why the #413
shader no longer meets the movement bars (0.867 against under 0.8). The tile bar (0.6)
is unchanged and did not separate the two shaders on the ramp (0.81 against 0.95, on the whole-tile
grid); the glide line and the movement lines do. The tile search now steps half a tile, and a new
line plants a flattened 32-pixel patch 16 pixels off the grid in the held stripes' last read and
wants the line to see it (0.000 of the clean read's 0.104), so the line is shown able to go red.
The app counts the slew in solver iterations (`TURING_ITERATIONS_PER_SECOND`, 180), not seconds,
as the lab does, and the check reads both numbers and refuses a rate outside (0, 1]. The bars for stripe width and the Drift 0 clock are
unchanged. Not tested: where a grey patch sits (a speckle of dead cells would still show in
the width line, not the tile line).


## 27. Every control does something you can see

### 27a-8. The closeup's camera holds still through the song (QA-31)

The owner, 2026-10-11, the evening after Frame Sway seated the plate's own sway (27a-7):
"the macro zoom is even bouncier and twitchier than before." What a real macro rig does:
the camera sits on a copy stand or a rail over the dish, and the only thing that moves in
the picture is the liquid. The microscope light shows and the macro references in the
project's shared files are all locked off; a push or a pan in them is a hand on a rail
over seconds, never a move with the beat.

Measured with `npm run steadycam` (the camera driven through a 120 bpm song, a kick a beat
and hats on the eighths, at 6x on a 1440 px frame, against the same run in silence), four
things moved the frame that were not the liquid:

- Macro Sync (0.5 by default) had three hands on the frame in every mode, outside Frame
  Sway: a punch-in on the kick, a push with the energy and a "handheld" tremor from the
  treble. The song swayed the frame 0.42% of its width (6 px) and pumped the zoom 3.2%
  (the frame's edge 23 px); at Macro Bead's 0.85, 0.71% and 6.3% (46 px). And the ear
  hears nearly every kick now where it once heard a third (`npm run kicks`), so the punch
  landed on every beat: "even bouncier".
- The lead aimed the camera ahead of its subject by the solver's velocity in the subject's
  one cell, times up to sixteen cells. That velocity carries the music through the liquid
  (Beat Squeeze's press, the kick's shove) and the noise of one cell of a turbulent field:
  a press of half a cell a step under a drop drifting steadily threw the frame 0.95% (14
  px) in a frame and 1.6% (24 px) over the beat, and left the drop 6.8% off centre.
- A cut in Auto landed on the lattice cell that found the drop, not on the drop, and then
  slid to it at 6 a second: 14% of the frame at 6x after a cut. In the check it was a
  13.8% difference between the song and silence from one cut that fell a frame apart.
- Each drop took a random walk of ±0.075 cells a step ("drift little on their own"), half
  a pixel at 1x and 4 px rms sixty times a second at 6x: "twitchier". A millimetre drop
  of oil in water has no Brownian motion to see (D = kT / 6πηR ≈ 4 × 10⁻¹⁶ m²/s, a couple
  of microns an hour), and the bubbles already keep still on still paint (18i).

Built: the punch, the push, the tremor and the rate's tightening in a loud passage ride
Frame Sway (`move = sync × sway` in `macroCamera.ts`; `LiquidVisualizer.tsx` hands the
camera `frameSway(settings.frameSway)`), so Macro Sync keeps what is an edit and not a
move: the cut on a kick, and the hold spent faster in a loud passage. The lead is the
tracked centroid's own motion smoothed over 0.6 s, from nothing on each new subject,
scaled to cancel the rig's own two lags so a steady drift sits centred; the camera does
not read the velocity field at all. A cut snaps to the drop's centroid, re-windowing about
it until it stops moving. The drops' random walk is gone; the flow and the tilt alone move
them.

After, by the same check: the song's hand on the frame is 0.000% of the width and 0.000%
of the zoom at Frame Sway 0 in Hold, Follow and Auto on every shipped look and show stage
(70 of them), the same centre and zoom as in silence to the bit; at Frame Sway 1 the dial
gives the 0.42% and 3.2% back, half of each at 0.5. The same half-cell press moves the
frame 0.17% a frame with it and without, the drop 0.44% off centre; a drop drifting at 15
cells a second sits 3.3% from the middle of the frame where it sat 27% off. A drop on
still paint moves 0 cells a step. `npm run steadycam` runs in CI's logic part, and each of
its controls (the gate removed, the random walk restored, the snap removed) turns it red.
`npm run drops`' fingerprint is pinned again (the two rng draws a step gone: 341 drops
where there were 336). The desk and the phone share the camera, and Frame Sway is on
both; the Guide's Music Sync line says what rides it.

### 27f-2. Plate Rock leans on the one and three (2026-10-22)

The owner, 2026-10-21: Plate Rock and Beat Squeeze "feel the same", and on 10-22: "make sure
we are using legit physics and simulations, as opposed to faking it." The hand was a 0.9 Hz
spring shoved on every kick, at its fastest the instant the kick landed, beside the kick's dye
burst and the squeeze's press: three moves on one beat, read as one.

Now (lib/plateRock.ts) the hand leans on the strong beats only (the one and three from
`BarGrid.placeAt`; the half bar's strong beats where only that is known; every other kick, two
beats apart, where the grid is unsure), each lean to the other side of an axis that turns 26°
a time, along a minimum-jerk reach (Flash and Hogan 1985, with the hand's speed carried into
the next reach) that takes 0.8 of the time to the next lean. With no kick for 3 s it puts the
dish down level. The lean is half the spring's peak: held as steeply for most of a half bar it
moved the colour three times as far as the spring (0.622 against 0.204 in the lab) and drove
the colour a loose cover glass piles at the grid's wall fast enough to cost the carries 1.38
substeps a step against 1.00 (27a-6). The liquid's answer is unchanged physics: the dye's weight
down the tipped plate in the gap (Darcy–Boussinesq, hsBody, ROCK_FALL).

`npm run rides`: 16 leans in 8 bars, all on one and three; consecutive leans opposite (cos
−0.90); a kick changes the hand's speed 0.80× as much as half way between kicks (the spring
16.0×); level 4.2 s after the last kick; the colour moved 0.368 at the default (the spring
0.204) and 0.666 at full; with a loose cover the carries take 1.00 substeps a step at the default (still 1.00) and 1.50 at full; rides 5c reads its drift guard on the old spring now, which still drifts the film over a cell a step. `npm run framesway`'s "half way slides it
less" line is read at full Plate Rock (the gentler default leaves the glass inside half its
room). The old spring stays as `springKick`/`springStep` for the lab's before.

### 27f-3. Beat Squeeze presses a sheet, where the kick lands (2026-10-22)

The glass press (KICK_RADII) closed the gap across most of the dish, so every kick breathed the
whole picture in and out: a frame move (27a-8), which is why Beat Squeeze sat at 0 on every look
but Bass Drop. A press that stays where it lands needs a cover that bends. Off the looks that
may move the frame (Frame Sway 0), the kick now presses a 0.1 mm polyester sheet laid on the
liquid, whose dent is set by elastohydrodynamics: w_t = (h³/12μ)∇²(D∇⁴w − F), whose only length
after a press held T is the bending length ℓ = (D h³ T / 12 μ)^(1/6) (Hosoi and Mahadevan 2004;
Lister, Peng and Neufeld 2013). The held point force's dent, (F/D)(1 − e^(−(kℓ)⁶))/k⁴ in
Fourier, crosses zero at 2.28ℓ and inside that is within a tenth of the clamped bowl squishDisc
already lays, so the kick lays one bowl of radius 2.28ℓ, as deep in the middle as the glass's
three stacked: 28 cells of 128 on the default oil, 15 in glycerine, 47 in water. It lands
anywhere in the middle half of the dish. Bass Drop (Frame Sway 0.35) keeps the glass.

`npm run rides`: the reach goes as μ^(−1/6) exactly; the dent moves a ring inside it 3.0
cells at the default and 6.8 at full; 30 → 70 cells out it falls from 2.99 to 1.35 cells where the glass's
barely falls (4.1 to 3.9); far off it moves the colour by its own displaced volume (0.345 of the glass's, the volumes saying 0.356); let go it comes
back 95% of the way at the default, 89% at full. Shortcuts (27f-4): the ring the dent lifts round itself is not laid (the gap is
never opened past rest), the reach is read at the 6 mm middle, and the release is KickRelease's
third of a second rather than the sheet's own slower relaxation.

### 27f-4. The rhythm sheet solved, not stamped (2026-10-24)

27f-3 laid the kick's dent as its held shape (a clamped bowl 2.28 bending lengths across) and gave it
back by a cosine over a third of a second. Now the sheet is solved (lib/sheet.ts `RhythmSheet`): a
fingertip of 5 mm on 0.1 mm of polyester floating on the 6 mm layer, D∇⁴w + ρg w = F − p, the layer
draining under it by lubrication, so w_t = M∇²(D∇⁴w + ρg w − F) with M = h₀³/12μ. Linear with
constant coefficients, every Fourier mode has its own exact step, e^(−λdt) and the load's
(1 − e^(−λdt))/(Dk⁴ + ρg), λ = Mk²(Dk⁴ + ρg): 128² modes on a box twice the plate's side, the plate
in one corner and its negated mirror images in the others, so every mode is a product of sines and
the sheet is held at rest, at the open air's pressure, on the plate's edges (the dish's open rim,
whose reservoir lets the liquid out and back). One inverse transform a step, done as half a complex
one because the sheet is real: 0.7 ms in node on the app's 192 plate. Each kick presses out from
under the sheet, within the dent's reach, as much liquid as the stamped bowl closed there
(stampedVolume, the shader's Stefan closing of the bowl), its middle capped at two thirds of the
gap, so the dial moves the colour as it did. Pressed first only as deep in the middle as the bowl,
the finger's sharper dent moved `npm run rides`' ring 1.9 cells at the default and 3.4 at full,
against the stamp's 3.0 and 6.8 and the line's 4. The change is laid each step through its own channel (applyDeltas'
`sheet`, squeezeUpdate's `sheetT`), as solved: no Stefan closing on top, and no ceiling at rest, which
would have cut the ring and ratcheted the gap closed where it went. The plate's spring is taken on
the sheet too, so what is laid is only the sheet's own motion. Off the GPU or off a thin gap the
stamp stays.

What the solve found. The liquid's weight was missing from 27f-3's reach: a floating sheet pushed
down is held up by Archimedes as well as by its stiffness, the two balancing at (D/ρg)^(1/4), 14 mm,
which is smaller than a dent. And the weight levels the layer as a puddle levels, at Mρg: 0.18 m²/s
in water, 8e-3 on the default oil, 2e-4 in glycerine. Without it, kicked twice a second the dish's
mean gap sank by more than half a dent's depth in a minute (the liquid pushed out under the sheet
stood outside the dish and came back only through the box's slowest modes); with it and the rim,
within 1.5% on the oil. 27f-4's own text had two things wrong: the dent does not shallow as
t^(−1/3) (with no net volume an unbounded sheet's goes as t^(−2/3), and on the plate the rim takes it
first), and syrup is not slower for the bending alone (every time in that solution is t/T; it is
the weight, levelling a thin liquid fast and a thick one slowly, that makes it so).

Measured (`npm run sheet`, 16 checks, node and the lab): the held dent within 1% of the integral of
the same equation in water, the default oil and glycerine; 57, 43 and 24 mm to its zero, a ring of
2%, 7% and 14% round it (the reach dentRadius now takes, by quadrature, within 5% of the solve's:
35, 27 and 15 cells of 128, where the bending length alone said 47, 28 and 15); let go, water
levels within a frame (96%), the oil gives back 96% in a fifth of a second and glycerine three
quarters, each within 1% of the theory while the dent is the finger's and not the rim's, and
water's last of it goes as the dish's slowest mode (0.231 a frame against e^(−λ₁/60) 0.231). On the
plate the gap is the solve's cell for cell to 0.03% of a dent, held, letting go, after a dozen kicks
and let go; the ring stands 7.6% of a dent past rest where the same change laid as a press is cut
at rest; a dozen kicks and twenty seconds later the dish's mean is within 0.02% of a dent of rest;
and past 4ℓ from a held kick the liquid moves 0.43 as fast as under the stamp. `npm run rides`'
Beat Squeeze lines now press the solved sheet: its ring 30 cells out goes 2.7 cells at the default
and 4.6 at full (the stamp's 3.0 and 6.8), 70 cells out 0.69, far off 0.175 of the glass's where a
stamp's volume would say 0.339, and comes back 99% and 100%. The line that asked the reach to go
exactly as μ^(−1/6) now asks it to narrow with thickness, the solve's (`npm run sheet` holds it
against the grid), and the one that asked the far ring to move by the stamp's displaced volume now
asks it to move less. Shortcuts (27f-8): the mobility is the rest depth's,
the sheet's rim is the plate's square, the gap under it the 6 mm middle, the force set from the
volume, the slosh dish's press keeps the stamp's timings, and (f) the layer drains by lubrication,
which is the liquid's own pace only in glycerine.

The review (the PR's one Opus pass) held the solve and found two places where it met the plate
wrongly. On a dome (Plate Shape below zero) the middle rests near the floor; a dent there closed
more than the gap had, the floor refused it, and the sheet's opening was then laid back in full,
so every kick near the middle left the gap more open: at Plate Shape −1 a dozen default kicks left
the middle a whole dent past rest and the dish's mean 10% of a dent open (13.5% at full; −0.5 at
full 44.8% and 2.2%). Now a kick presses no deeper than the dome's rest under it (`kickRoom`), and
the shader owes what its floor refuses (the squeeze texel's fourth number, paid out of the sheet's
next openings, taking the spring as the gap does): read against each dome's own rest, a dozen kicks
and let go, the gap is the solve's to 0.12% of a dent cell for cell and the mean within 0.06%. And
the sheet set `pressed` on every cell it moved, which is every cell, so the press memory stopped
for every other press while a kick's sheet was live: a hand press's push after it went from −4.5e2
a step to under 3. The memory now carries a rate of its own (the texel's third number, this step's
without the sheet's), and the same press reads the same, step for step, with a sheet live across
the plate. The squeeze texture is RGBA32 for those two numbers. Also named by the review: Reynolds
needs the layer's viscous time h²/ν short against the motion, true only in glycerine (27f-8(f));
`rides`' far line now asks both ways against the solve's own share of the stamp's volume that
leaves 70 cells (0.568, so 0.193 against the 0.175 read), and the quiet asks for the slowest
mode's time (oil 1.400 s against 1.391), not 255 s.

### 27f-5. The rock lifts the oil, not the frame (2026-10-24)

Oil on a tipped plate is lighter than the water round it (light mineral oil, 880 kg/m³), so
under the cover it rises the other way from the heavy colour, a bubble under a tipped glass.
Built in the thin gap's `hsBody` (wgsl/thinGap.ts): the force c·Δρ g sinθ uphill (fluid.ts
`OIL_LIFT`, in SI: 0.16 m/s a unit of sinθ at the 6 mm rest gap through the default 22 cSt, no
tuning), laid as the closed dish's own circulation, u = ∇⊥ψ with −∇²Ψ = ∇c and Ψ = 0 near the
rim (`hsLiftSource`, `hsLiftRelax`: over-relaxed red-black sweeps, eight a step, warm from the
last step, ψ multiplied by the tilt). So an even sheet of oil feels nothing, the picture's mean
flow is zero by construction, and the rim holds what reaches it. The tilt is the step's
`rockX`, the hand's swing and the phone's tilt both. With the oil there the colour's weight is
the water's colour alone (Oil Bodies' own share taken off, `WATER_DYE`), over its own mean taken
on the GPU this step (`hsOilMean`): weighed whole, a Clock Glass body's colour pulled it
downhill about nine times as hard as its oil lifts, so the bodies sank against their buoyancy.

Measured (`npm run oillift`, lab, sinθ 0.1): a lens rises at 6.21 mm/s against Hele-Shaw's 6.40
worked out in SI for its soft edge (Δρ g sinθ h²/12μ, halved for the water it pushes round it,
× (1 − a²/R²), × ∫c²/∫c); a level one stays put; a lens carrying Clock Glass's colour rises at
88% of a plain one (the 6% of its colour Oil Bodies leaves in the water at its edge weighs as
dyed water); what the tilt adds to the picture's mean flow is 0.000 mm/s on a full sheet and
under 0.02 mm/s on half sheets (the first try, below, 4.2), and Clock Glass's own lay rocked
keeps its mean at 1.5% of its liquid's speed; a lens rocked into the rim keeps 99% of its oil
over six seconds of a steady tilt and stops.

Tried first, and taken out of #440: the buoyancy on the two-layer dish's oil rafts alone slid
an oil sheet across the dish, the whole picture, at −4.2 mm/s a lean (Oil & Water and Clock
Glass both run the default Plate Rock at Frame Sway 0), and a lens at the rim drove into it.
Then, in this PR's first cut, the force laid as the oil's share over the dish's mean,
(c − c̄) L, as the colour's weight is: the frame held, but through the gap's open rim (p = 0, the
plate's free edge) a lens that reached it went out, 88% of it in three seconds at 6°. Laid as
the circulation but held to zero only on the rim's own cells, it lost 7%; three cells in, 0.9%
over six seconds, of which the same lens left level there loses 0.2%. Open: 27f-6 (a standing
plate), 27f-7 (the lift's circulation is the even gap's; the mix's oil has the water's
viscosity), 18g-6 (a body touching the rim drains through it by its own surface tension, on
main).

## 28. Preset palettes: the looks refreshed for what the plate does now

### 28e. A breakdown is quieter on the plate, and Classic is blobs again (#368)

Reported by the showreel (28d, 2026-10-11): every look rendered on the Mac to the same
minute of Funkorama, which grooves at about -17 dB, drops 7 to 8 dB into a breakdown from
26 to 44 s and comes back. On 28 of 41 looks the plate moved more in the breakdown than in
the groove, and Classic, the default, scored 4 of 10: a full-frame wash with brown bubble
discs and no bodies, its motion running backwards against the music (r -0.77 over 5 s).

The suspect was the ear's auto-level chasing the quiet. Measured on that minute through
the ear a render uses (`songAudioTrack`), it was part of it, not the cause: the band
levels the hands read fell to 0.6 to 0.76 of the groove's in the breakdown while the
song's amplitude fell to 0.4 (each a decibel reading ranged against a ceiling that falls
back in 8 to 18 s), so the breakdown read quieter, just not quiet enough. The cause was
Sound Drive's bass on a thin gap, a hand on the glass that moves the liquid by the change
in its depth (the flow is the gap's rate). The route read the bass over 70 against a
ceiling of 85, so a loud groove's bass sat at full 0.55 of every second: the glass was
held flat and the kicks moved nothing. The breakdown's bass, under the line, rose and
fell with every note. Its change per second was 1.44× the groove's, and per second it
followed Classic's measured motion at r 0.74 (Roy, Red Cabbage, Clock Glass, Aurora 0.65
to 0.68; the looks that did follow the band, Acid Trip, Solar Flare, Cell Bloom, read
-0.11 to -0.44 against it). The plate's rock and cover glass, the other suspect, were
calmer in the breakdown (cover speed 9.3 cm/s against 15.4) and ran against the motion.

What changed. The ear reports how loud the passage is against the song's loud passages,
as an amplitude (`Passage` in lib/soundLevels.ts: the waveform's mean square over 2 s
against a reference that rises in 3 s and falls in 45 s), and the music's hands are
scaled by it: the pours, the bursts, the sparks' count and the bass's press. A hand
answers the sound's pressure, which is an amplitude. The levels themselves are left as
they were, because the beat clock, the meters and the mappings read them. And the press
reads the band over its own ceiling (`bassPressLevel`), so the loud groove's kicks press
and let go. The cast wire carries the passage, so the wall calms with the laptop.

Measured (`npm run breakdown`, the band's chorus, its verse 8 dB down, the chorus; and
the showreel's minute with `BREAKDOWN_SONG`): the press's change per second in the
breakdown against the groove, 1.36× before and 0.54× after on the band, 1.44× and 0.54×
on Funkorama, where the groove's own press moves 1.4× more than before; the hands'
levels 0.87× and 0.69× before, 0.37× and 0.36× after. A song quiet from its first bar
reads 0.91 (not a breakdown); the volume turned down 10 dB is learned in under two
minutes (0.54 a minute on, 0.78 two).

Classic: Dye Budget 0.45 (the default 0.85 filled the dish until the colours ran into one
wash, the fault Velvet Underground was fixed of), and Bubbles 0.05 (the brown discs were
the default 0.2, trapped air drawn dark against a full dish).

## 28f. Every look answers the music through its own patches

### 28f-1. The dead patches, the named looks, the hits as a source, the pattern

Asked 2026-10-11 in the gallery review: the show hears the music well now, so the looks
should answer it more by default, through the patch bay; "it's ok if the whole plate
moves (or other global changes) with a small subset of presets. I just don't want this
kind of look to be a default across all presets"; and "only use things that we can
detect quickly and make changes that are appropriate for the music".

Found: four of the shelf's 17 patches never moved anything. They named a drum or a note
(`kick`, `hats`, `note`, `tonalMid`) on the `sound` source, whose features are the hook's
loudness, bass, mid, treble, energy, timbre and complexity, and the fold reads a name its
source lacks as 0: Bass Drop's kick on Plate Rock, Microscopic Chaos's hats on Beads,
Aurora's note on Comet Speed and its mids on the hue journey. Comet's timbre was patched
at a depth of 45 (meant as degrees; a depth is a share of the dial's 0..360), which threw
its heading to the clamp at any timbre. Oil Wheel's band patched onto the dish's motor,
the frame and not the liquid, and nothing held a look to the owner's rule. And a patch
could read each drum's level but not its hits: a level is loud between hits too.

Built: the four read their names from the `bands` source (Aurora's held chord now turns
the hue sooner); comet's depth is 0.125, the 45° meant. `FRAME_MOVING_LOOKS`
(lib/plateRock.ts) names the looks that may move the frame with the music: Bass Drop
alone, at Frame Sway 0.35, its kick's hit on Plate Rock. Oil Wheel's mids went into the
oil (Buoyancy). The hits are a patch source (`hits`, lib/hitSource.ts): Kick, Snare and
Hats hit, Any hit (how hard the last one landed, falling over a quarter second; read when
the onset's time moves, at the strength it was given, `OnsetState.last`, so a plate
drawing twenty frames a second still sees them) and Pitch, on the desk's patch bay, the
phone's (the same sheet) and Sound learn, with Sound Impact as its master. Beat phase
was already patchable: the Shapes source's LFOs run on the bar. Cyberpunk (kick, snare,
hats), Fillmore East (bass on the pour, a hit's stir) and Lava Lamp (the bass on the
wax's buoyancy, a held chord on the hue) are the pattern the rest follow (28f-2).

Measured: `npm run soundpatch` (new, in Measure): every patch on the shelf moves its
control (before: 4 of 17 read nothing, comet at 45; after 24 of 24); each of 160 kicks is
in Kick hit on its own frame at its strength, under a tenth of its peak 0.6 s on, over
half on 11% of a drop's frames; at one reading in three, Any hit rose for 200 of 225 hits
where the hit's own reading reached the loop for 72. `npm run framesway`: only the named
looks move the frame (before: Oil Wheel and the two show stages that play it patched
sound onto the motor), the list one of at most four, and Bass Drop's picture slides
0.53% of the plate at its peak.

## 28g. Following a known song played live

### 28g-1. The follower and its check (#378)

The owner, 2026-10-11: "if we pre record the shape of the song, how can we map that to a
different sounding and sometimes improvisational version of the same song?" `chroma.ts`:
a twelve-note profile, read from the analyser's tonal peaks (parabolic-refined) on a
per-bin quarter-second median (drums dropped), the same arithmetic in the ear
(`AudioReading.chroma`) and in the map (`mapChroma`, stored with every new map as
`SongMap.chroma`). `songFollow.ts`: the forward algorithm over a place × tempo grid
(0.6–1.6×), the form as transitions at the map's section ends, a leak for jumps the form
did not offer, a start prior, and confidence = match quality × agreement. `npm run
songfollow` (Measure, logic): takes 15% slower and faster on other instruments 100% of
hops within a bar of the very place, tempo within 3%; a band speeding up 100 to 140 bpm
with a bar of silence, 100%; bridge skipped, chorus repeated, solo doubled, a 16-bar jam:
back within 0.7–1.8 bars; joined at the second verse, found in 1.9 bars; confidence 0.07
in the jam against 0.92 where followed. `anchor(mapSec)` is the score's nudge (28h). The
ear's frame costs 5 µs more (237 to 242 in node). Online time warping and a particle
filter were tried first and dropped (the reasons in `songFollow.ts`'s header).

### 28g-2. The follower live, with the fallback (this PR)

Before, the place the show read a song map at was a clock from the moment the song was
identified. `followedPlace.ts` makes it the follower's place when the follower is sure,
and the clock run on from the last sure place, at the last sure tempo, when it is not;
while unsure the map's section is withheld (`section` null), so the sequencer runs a
section stage on its own clock and the show has the song's shape heard live. A map made
before 28g-1 (no harmony) is the old clock, to the bit. `useMusicIntelligence` builds one
per song and map, resyncs it when the song is identified (the fingerprint's offset starts
the clock and anchors the follower), feeds it every reading of the ear (`onReading`), and
reads it on its tick. Measured by `npm run songfollow`, 16 checks on the place:

- Identified as each take begins, the place read is within a bar of the song on 100% of
  hops on the takes 15% slower and faster, where the old clock is 9.3 and 6.8 bars out by
  the last chorus; the map's section read is the song's on every sure hop.
- Set to the follower's every answer, the place stepped by up to 0.27 and 1.29 bars between
  frames; steered (the difference closed over a second, a jump only after a second of
  being over a bar out), it makes no step on the slower take and one on the faster, from
  1.42 bars out to 0.03 (the intro's held chord).
- Deciding on the follower's confidence hop by hop, a third and a quarter made the jam
  sure for moments and the place jump 24 bars with it; 0.5 and 0.4 switched the slower
  take fifteen times. Held over 1.5 s (rising over 0.75 s), sure at 0.5, unsure under
  0.35: no switch once settled on either take, the jam unsure on 107 of its 112 hops from
  its third bar, the place running on through it without a jump.
- Two changes to the follower the place's checks found. In a jam the weight ran to the
  slowest tempo (0.99 going in, 0.62 at the chorus after): while lost (confidence under
  0.2) each place's weight is now spread over the tempos as the band was last known to
  play, and the tempo is 0.95 through the jam (without it the place was sure on 17 of the
  jam's hops and jumped 5.3 bars). And quality now rises over 1.5 s where it falls over
  3: the place was sure of the chorus after the jam 5.4 bars in, now 1.8. The follower's
  own numbers: confidence where followed 0.87–0.98 (was 0.74–0.93), in the jam 0.11 (was
  0.07), every place and relock number the same; 1.0–1.5 ms a second of sound.
- Agreement by the map's harmony instead of its section labels was tried and changed no
  number; left as it was (28g-4).

`npm run followview` (Measure, browser): the app's own band is the song, its score
rendered as Web Audio plays it and its map made from that. Tagged by name, the Perform
desk's status bar says "Following “…”: 87% sure"; the track panel (the laptop without a
desk), tagged twenty seconds into the band's verse, shows the verse while a clock from the
tag says intro, five samples of five; the phone's Sound sheet says the desk's line under
the song's shape. A song in C sharp the band never plays: "Not sure where in “…” (0%):
following its sound", the playhead keeping time. A map with no harmony: no line.

## 28h. The score: the song drawn, its show's cues on it, and a nudge (asked 2026-10-11)

The owner: now that the show hears a song and
remembers it, draw it as a score, put the sequencer's changes on the song's shape,
and during a show watch it and nudge the visuals back into step. Built on what was
there: the song map (sections and energy from the first listen, `songMap.ts`) and
the song's show (`songShows.ts`, cues that already fire "at the second chorus").
`lib/songScore.ts` draws the sections, the energy and the playhead, and places each
cue by running the scheduler itself over the song, so the picture cannot disagree
with what fires. A tap on the lane picks a section; a cue added there is pinned to
it ("this chorus only" or "every chorus"), and a song with no show gets one on the
look that is playing. The nudge moves the song's position: a beat (half a second
with no tempo), "Section starts now" (the show got there early) and "Next section
now" (the song got there first), the section ones worked out from the clock at the
press rather than the position last drawn; it lasts for that play of the song and
survives the fingerprint's re-anchoring, which is right about the audio and blind
to where the map put an edge (`SongPosition`). A nudge is a seek: lyric triggers
and a replay's gestures start from where it lands. A show the score makes by
pinning its first cue starts without fading the plate to its look. "Before the end"
cues count from one length for the runtime and the score (`songDuration`: the
track's, the show's note of it, then the map's). The desk's Score panel (Live) and the phone's Play sheet draw
the same component. `npm run score` (in Measure): every cue drawn where the
scheduler fires it, pinning, a stretched and skipped live take read through map
time, and both section nudges (a late map edge: the chorus cue at 40 s unnudged,
at 37 s when "Next section now" is pressed as the chorus is heard).

With the followed place (28g-2, #387): a nudge moves the place the follower holds
(`FollowedPlace.resync`, PLAN 28g-8), not only the clock's offset, and the score and
the shows read that place. An identification while the follower is unsure resyncs to
the fingerprint's offset plus the nudge, so a nudge survives a re-anchor.

## 28i. Every look judged again, after the lamp, the soap film and the breakdown

### 28i-1. Nine looks retired (#408; Antigravity, batch 1 of the overhaul)

The verdicts are PLAN 28i's, from the Mac gallery of 2026-10-19. Nine ids left `PRESETS`,
`PRESET_CONTRACTS`, the inject styles and the liquid table and entered `RETIRED_PRESETS`,
each with its reason: `sensual-laboratory` → `turing-print`, `oil-on-water` →
`oil-and-water`, `colorful-cosmos` → `classic`, `agate` → `chemical-clock`,
`ferro-maze` → `magnet-garden`, `deep-ocean` → `jellyfish-bloom`, `fillmore-1969` →
`poster-1969`, `timbre-shifter` → `microscopic-chaos`, `oil-wheel` → `clock-glass`.
`sunny-side-up` still names Colorful Cosmos and so reaches Classic by two hops; the
resolver follows the chain. Lumia stays (28i-5). A saved show, a pad, a stage or a
`?look=` link that names a cut id plays the replacement.

What else moved with them: the dead seed cases of three of them in `LiquidVisualizer`
(Sensual Laboratory's and Ferro Maze's clean-glass cases went too; Turing Print keeps
its own), and the one-line hook that laid the Fillmore's second-plate wash
(`laySecondPlate`: nothing can name that look now; the `fillmore-wash` seed stays,
because `npm run wall` lays it by hand); the built-in sequences (Set Journey lost its
second Poster stage, which would have faded Poster into Poster; the stage names that
named a cut look are the replacements'), the mood buckets in `evolution.ts` (a duplicate
of a look already in the bucket where the replacement was there, so the bucket's length
and every song's pick by ISRC stay as they were), the example set, the Guide's one
sentence, and the scripts, each listed in the PR body under `Check changes:`.

What a replacement did not carry, found by running the checks that named the cut look,
is PLAN 28i-6: no look ships the camera pass or Two Projectors any more, and Poster, 1969
ships Beat Squeeze 0 and no patches where the Fillmore had 0.1 and two.

`plate` 5b needed one rewrite. Its last line compared the table's first entry with what
`findPreset` returns, which is only true while every entry names a live look; it is now
two lines, one over every retired id against the end of its own chain, written out in the
check and not taken from `livePresetId`, and one that a chain is followed the whole way.
With the resolver cut to one hop both are red (`sunny-side-up → nothing (wanted classic)`).

### 28i-2. Give back the black, make the still ones move (this PR)

Reworked the 21 looks named in PLAN 28i-2 across `src/presets.ts`, `src/presetPlate.ts` and `src/components/LiquidVisualizer.tsx` (`seedPreset`), plus the preset-list cleanups in `src/lib/evolution.ts` (duplicate `jellyfish-bloom` removed from `calm`) and `src/lib/sequencer.ts` (`poster-1969` appears once in `Pace`, with `classic` on stage 1 and `oil-and-water` on stage 5):

- **Film near black (5th pct ≥ 20%):** `classic` (`dyeBudget: 0.18`, `evaporationRate: 0.012`, `gooeyEffect: 0.78`, `hueJourney: 2`: film near black `28%–37%`, `6 hues`), `galaxy` (`dyeBudget: 0.24`, `evaporationRate: 0.006`, `ledPlatform: false`, compact two-arm spiral seed: film near black `57%–62%`, `3 hues`), `stardust-collapse` (`dyeBudget: 0.24`, `evaporationRate: 0.011`, `hueJourney: 2`, four-colour spiral seed: gallery colours `0.384 / 0.509 / 0.552 ≥ 0.3`, film near black `43%–71%`, `3 hues`), `jellyfish-bloom` (`rotationSpeed: 0.115`, `automateRate: 0.22`, `gooeyEffect: 0.28`, `evaporationRate: 0.003`, default `0.85` budget, radial-weighted dome/tentacle seed with `seedMean ≈ 0.45 < 0.85`, keeping #454's area cords: gallery flat `0.178 / 0.237 / 0.258 ≤ 0.4`, motion `0.0779 / 0.0545 / 0.0355 ≥ 0.02`, film near black `42%–57%`, `3 hues`), and `bass-drop` (`globalSpeed: 0.022`, `advection: 0.62`, `damping: 0.82`, `platePressure: 0.05`, `turbulenceScale: 0.08`, `evaporationRate: 0.020`, `dyeBudget: 0.24`, `beatSqueeze: 0.8`, `beatAccent: 1.0`, `kickBloom: 0.06`, `frameSway: 0.35`, default `plateRock` `0.45` with `kickHit → plateRock 0.5` keeping `npm run framesway` peak slide at `0.343%` as on `main`, `glassSmear: 0.0` resting under the `0.20` smear gate until `bands:hats 0.15` and `hits:hatsHit 0.16` open it together in the chorus, `kickHit → areaPour[1] 0.45`, keeping #454's area cords: film near black `49%–88% ≥ 20%`, `peak × median = 3.1 ≥ 2.5`, `4.0 swells/min`).
- **Cell Bloom (`flat ≤ 0.4`, `luma(40s) ≥ 0.5 × luma(8s)`):** `centerGravity: 0.75`, `buoyancy: 0.05`, `evaporationRate: 0.0`, `dyeBudget: 0.85`, `automateRate: 0.35`, `rotationSpeed: 0.18`, and two concentric rings of multi-hue cellular drops around the area pools in `seedPreset`: gallery `8/20/40 s` `L0.427 F0.185 | L0.333 F0.175 | L0.314 F0.056` (`flat ≤ 0.185 ≤ 0.4`, `luma(40s) = 0.314 ≥ 0.214 = 0.5 × luma(8s)`).
- **Cyberpunk (`95th-pct near black ≤ 60%`, `≥ 3 hues`):** `evaporationRate: 0.005` (was `0.05` on treble density, which dried the dish to 99% black and 1 blue hue), `dyeBudget: 0.70`, `density: 'bass'`, `hueJourney: 2`, `automateRate: 0.26`, and 8 neon arcs across pink, cyan, purple and lime: film near black `18%–48%` (`95th pct = 48% ≤ 60%`) and `3 hues`.
- **Off-white grounds (`turing-print`, `roy`, `red-cabbage`, `lava-lamp`, `milk-marble`):** `turing-print` keeps `lampGround: 1`, `ledPlatform: true`, `ledColor: '#ffffff'`, `chemistry: 1`, `chemistryPattern: 1`, `turingPrint: 1`, `turingDrift: 0.7`, `exposure: 0.7`, `automateRate: 0.16`, `rotationSpeed: 0.035`, sets `PRESET_CONTRACTS['turing-print'] = [16, 19, 8, 22]`, and seeds 8 four-colour CIMA spots in `seedPreset`: gallery `8/20/40 s` `L0.089 C0.485 | L0.070 C0.420 | L0.086 C0.437` (`colours ≥ 0.42 ≥ 0.3` by 8 s, `luma ≤ 0.089 ≤ 0.6`); `roy` sets `dyeBudget: 0.68`, `automateRate: 0.28`, `evaporationRate: 0.0006`, `centerGravity: 0.28`, `buoyancy: 0.28`, `advection: 0.42`, `platePressure: 0.38`, and adds 6 primary comic shapes around its 3 core pools with blue kept apart from red and yellow so `royopen` holds `0.2%` stain (`6/6`): gallery `8/20/40 s` `L0.537 F0.273 | L0.501 F0.305 | L0.515 F0.280` (`flat ≤ 0.305 ≤ 0.5`, `luma ≤ 0.537 ≤ 0.6`); `red-cabbage` sets `lampGround: 1`, `ledPlatform: true`, `ledColor: '#e8dff5'`, `phIndicator: 1`, `exposure: 0.75`, `dyeBudget: 1.1`, `automateRate: 0.24`, `rotationSpeed: 0.085`, `evaporationRate: 0.001`, `hueJourney: 2`, and seeds five additional anthocyanin pH zones around its two acid/base wells: gallery `luma = 0.189 / 0.199 / 0.232 ≤ 0.5` and film `5 hues ≥ 3`; `lava-lamp` sets `lampGround: 1`, `ledPlatform: true`, `ledColor: '#b58c5c'`, `exposure: 0.46`, `centerGravity: 0.32`, `buoyancy: 0.42`, `advection: 0.48`, `automateRate: 0.30`, `dyeBudget: 0.65`, and seeds eight translucent wax plumes (`seedMean ≈ 0.37` with initial thermal rise and sink so convection is visible by 8 s without Beer-Lambert blackout): gallery `8/20/40 s` `L0.374 C0.978 M0.0739 | L0.471 C0.993 M0.0462 | L0.500 C1.000 M0.0313` (`luma ≤ 0.500 ≤ 0.6`, `motion ≥ 0.0313 ≥ 0.02`); `milk-marble` sets `lampGround: 1`, `exposure: 0.72`, `dyeBudget: 1.1`, `automateRate: 0.14`, and reduces the white milk base in `seedPreset` from `3.5` to `2.1` while enlarging the six colour spots: gallery `luma = 0.340 / 0.398 / 0.459 ≤ 0.6` (`0%` white blowout).
- **Colour (`macro-bead`, `lace-run`, `chemical-clock` ≥ 6 colour changes/min):** `macro-bead` (`macroCamera: 'auto'`, `macroZoom: 2.1`, `macroHold: 2.5`, `globalSpeed: 0.06`, `automateRate: 0.45`, `rotationSpeed: 0.14`, `hueJourney: 2`, 6-hue ring seed: film `3 hues ≥ 2`, `11.2 colour changes/min ≥ 6/min`), `lace-run` (`macroCamera: 'auto'`, `macroZoom: 2.1`, `macroHold: 2.4`, `globalSpeed: 0.07`, `automateRate: 0.45`, `rotationSpeed: 0.16`, `hueJourney: 2`, 6-hue ring seed: film `2 hues ≥ 2`, `9.9 colour changes/min ≥ 6/min`), and `chemical-clock` (`lampGround: 1`, `ledPlatform: true`, `ledColor: '#fbf6ee'`, `bzReaction: 0.78`, `exposure: 0.58`, `dyeBudget: 0.75`, `evaporationRate: 0.004`, `automateRate: 0.28`, `rotationSpeed: 0.22`, `hueJourney: 1`, `bands:tonalLow → bzReaction -0.58` and `bands:tonalMid → bzReaction -0.55`, 6 translucent indicator pools with `seedMean ≈ 0.65` so `t = 8 s` reads `L0.129 C0.742 M0.0655` and `40 s` `L0.256 C0.828 M0.0683`: film `5 hues`, `11.2 colour changes/min ≥ 6/min`).
- **Microscopic Chaos (`detail ≤ half of 10-19`, `motion ≥ 0.02` at 20/40 s):** `lampGround: 1`, `ledPlatform: true`, `ledColor: '#f1ebf5'`, `boundaryContrast: 0.0`, `beads: 0.0`, `cells: 0.0`, `gooeyEffect: 0.15`, `postBlurRadius: 1.0`, `rotationSpeed: 0.30`, `exposure: 0.22`, `saturationBoost: 1.05`, `dyeBudget: 0.72`, and broad overlapping soft blobs in `seedPreset`: gallery detail `0.0073 / 0.0128 / 0.0127` vs 10-19's `0.0199 / 0.0475 / 0.0525` (`≤ 37%` at 8 s, `27%` at 20 s, `24%` at 40 s, all well under half) and motion `0.0202 / 0.0516 / 0.0573 ≥ 0.02`.
- **Gallery motion ≥ 0.02 at 20 and 40 s (`velvet-underground`, `poster-1969`, `home-movie`, `clock-glass`, `crowd-plate`, `lava-lamp`, `jellyfish-bloom`, `microscopic-chaos`):** `velvet-underground` (`layerCount: 1`, `rotationSpeed: 0.27`, `gooeyEffect: 0.55`, `exposure: 0.78`, `automateRate: 0.16`, `dyeBudget: 0.42`, keeping #454's area cords: `0.0335 / 0.0424`), `poster-1969` (`layerCount: 1`, `rotationSpeed: 0.095`, `automateRate: 0.22`, `globalSpeed: 0.022`, `advection: 0.65`, `dyeBudget: 1.1`: `0.0527 / 0.0998`), `home-movie` (`rotationSpeed: 0.165`, `automateRate: 0.20`, `globalSpeed: 0.019`, `buoyancy: 0.48`, `advection: 0.55`: `0.0433 / 0.0541`), `clock-glass` (`rotationSpeed: 0.19`, `automateRate: 0.20`, `globalSpeed: 0.022`, `buoyancy: 0.38`, `advection: 0.45`: `0.0324 / 0.0501`), `crowd-plate` (`rotationSpeed: 0.095`, `automateRate: 0.18`, `globalSpeed: 0.022`, `buoyancy: 0.45`, `advection: 0.60`, 6-spot swirled seed: `0.0327 / 0.0544`), `lava-lamp` (`0.0462 / 0.0313`), `jellyfish-bloom` (`0.0545 / 0.0355`), `microscopic-chaos` (`0.0516 / 0.0573`).
- **The projector check no longer reads the dish's weather:** `scripts/webgpu-smoke.mjs`'s "the projector places the picture on the wall" asked that over half of the frame's top rows be lit before the pin, and read them off whatever the opening look had grown. Classic's opening is dark by design here, the Mac read 49% on 05ee5f1 (show shard red), one point under a bar that is about the projector. The bar is unchanged; the check now turns the LED floor on for its measurements and puts it back, so the picture under the mapping fills the frame by construction (cloud run of the check's own block, Classic's opening: top rows 83-88% lit as it comes, 100% with the floor, pinned edge 0%, blackout 0%).
- **Poster, 1969 step-rate investigation:** Measured on this Mac over 12 s (`squeeze` harness), `poster-1969` ran `layerCount: 2` (`2 × 384²` thin-gap plates = 12 GPU solver steps per render frame at the 6-substep cap), stepping at `15.9 steps/s` (`191 steps / 12 s`, `simMs = 45.2 ms`). Moving `poster-1969` to a single plate (`layerCount: 1`, matching its 28i-1 description `"Poster, 1969 draws on one plate"`) cuts its GPU solver work in half and raises its 12 s step rate by **+56%** to `24.8 steps/s` (`298 steps / 12 s`, `simMs = 24.1 ms`). Reaching `>= 30 steps/s` (`PINNED_STEP_RATE`, as `1 × 256²` does at `35.2 steps/s`, `422 steps / 12 s`, `simMs = 11.4 ms`) is tracked as open item `PLAN 28i-2a`.

### 28i-3. Sound on the liquid, not the frame: the eight rotation looks and Milk Marbling's dead patch (#473, with 28f-3 and 28i-6(d); 28i-3b and 28f-2 remain open in PLAN.md)

Asked in PLAN 28i-3 and 28f-3: move the eight looks that still drove `audioMappings.rotation` from sound onto liquid targets (`rotation: 'none'`), fix Milk Marbling's dead `treble → airVelocity` patch (`0.02`), and give every look that hears sound two or three fast liquid patches or area cords from `hits` and `bands` only (`docs/sound-patches.md`), using 25h's area cords (`lib/areaCords.ts`) where parts of the plate answer on their own.

What shipped in #473:
- **Eight looks off `audioMappings.rotation` (28f-3 / 28i-3):** `galaxy` (`energy`), `cyberpunk` (`complexity`), `acid-trip` (`energy`), `aurora-borealis` (`energy`), `solar-flare` (`bass`), `fractal-dream` (`treble`), `neon-coral-reef` (`timbre`) and `stardust-collapse` (`bass`) now set `audioMappings.rotation: 'none'` and route their readings into liquid controls (`buoyancy`, `turbulenceScale`, `surfactantFlow`, `injectRate`, `colorShift`, `beads`, `reactionRate`, `flowSpeed`). The other two of 28f-3's ten looks had already left the slot before #473 (`timbre-shifter` moved `rotation: 'timbre'` to `'none'` in #351 and was retired with `deep-ocean` in #408). `scripts/framesway.mjs`'s `frameRoutes` now counts `audioMappings.rotation !== 'none'` alongside `plateRock`, `frameSway` and `rotationSpeed` (`npm run framesway`: 59 of 59 looks and stages still; on `origin/main` it fails naming all eight looks).
- **Milk Marbling's dead patch fixed:** `{ source: 'sound', feature: 'treble', setting: 'airVelocity', depth: 0.02 }` moved `airVelocity` from `0` to `0.008`, which `LiquidVisualizer.tsx:4257` (`airV <= 0.1 ? 0 : ...`) gated to `0`. Replaced with two area cords on its food-colouring spots (`hits:kickHit → areaPour[0] 0.45`, `hits:snareHit → areaStir[1] 0.45`). `scripts/soundpatch.mjs` §1 now folds each patch on the look's own settings (`ownBay`) as well as on defaults and requires `|ownBay.global[m.setting] - own[m.setting]| >= 0.03 * span` and `!(m.setting === 'airVelocity' && ownBay.global.airVelocity <= 0.1)` (on `origin/main` it fails naming `reads nothing: milk-marble sound:treble on airVelocity`).
- **Area cords and colour families (`src/lib/plateAreas.ts`, `src/presets.ts`, `scripts/soundpatch.mjs`):** Added explicit disjoint `dyes` families to `lumia` (`[0]`, `[1]`, `[2]`) and `cell-bloom` (`[0, 3]`, `[1]`, `[2]`), and added `PRESET_AREAS` entries for `poster-1969` (three poster shapes: left `milk` `[0, 1]` on `bass`, right `ink` `[3, 4]` on `mid`, lower `milk` `[2]` on `treble`), `milk-marble` (three food-colouring spots in `OWN_SEED_AREAS` so `seedPreset` still lays the white milk dish and four spots: `[0, 1]` on `bass`, `[2, 3]` on `mid`, `[4, 5]` on `treble`), and `red-cabbage` (two pH wells: left `acid` `[0]` on `mid`, right `base` `[1]` on `bass`). `poster-1969` joins `soundpatch`'s `PATTERN` list (closing 28i-6(d)), and `soundpatch` §2 counts both plate-wide liquid patches and area cords on fast readings (`hits` and `bands`, including onsets and notes) toward a look's two or three while holding area looks free of redundant plate-wide patches (`100 of 100 move`, `29 looks checked (+ 3 from 25h)`).
- **Patch bay hit targets on the desk (`src/components/SettingsPanel.tsx`):** Now that `classic` and `jellyfish-bloom` carry `sceneMappings`, the `patches` deck panel renders their patch cards on load; `Remove mapping` (`h-6 w-6`), `Depth` (`set-range`), `patch-gate-on` (`h-6 w-6`) and the gate sliders (`set-range`) meet the desk's 24 px minimum hit-target rule (`npm run layout`, `npm run qa`).
- **Still open in `PLAN.md` (`28i-3` film measure, `28i-3b`, `28f-2`):** A fresh showreel (28f-2) and a main-vs-head film on the same looks (seed 1, band in a box) are still owed, and 27 of the 28 changed looks still miss one or more of the 28i film bars (`2–3.5 swells a minute`, `at least 6 colour changes a minute`, `r1 in [−0.13, 0.22]`); all 28 per-look numbers are recorded under `28i-3b` in `PLAN.md`.

## 28j. Changing looks without a jump

### 28j-1. The patch list and the ferrofluid ring cross over, not cut (this PR)

The owner, 2026-10-19: "Transitions between presets are also a little jumpy here and
there." Found by blending every pair of the 32 looks (992 ordered pairs) in thirty ticks
and looking for the largest change in one tick of what the plate reads: `blendLooks`
travels every number and colour on `ease(t)`, but the lists, steps and booleans switch at
`SWITCH_AT = 0.5`, so anything riding on one of those jumps all at once there.

Two of those jumped on nearly every pair and could be fixed with no GPU:

- **Patches (`sceneMappings`).** The old look's list was the list until the midpoint and
  the new look's after, so a depth of 0.5 became 0 and another 0.5 appeared in one tick,
  on 572 pairs. `crossfadePatches` (`lookFade.ts`) matches patches by source, feature,
  setting and layer; a patch both looks carry moves from one depth to the other on the
  same ease, a patch only the old one carries fades out and one only the new one carries
  fades in. The identity includes the layer on purpose: a patch for layer 2 and the
  same patch for layer 3 are two patches. Measured over all 992 pairs, the largest depth
  step in one of thirty ticks is **0.500 before and 0.025 after** (bar 0.06, `desk`).
- **The ferrofluid ring (`phaseAmount`).** The handoff lays the new look's ring in one
  frame at p = 0.5 (or clears it), while the drawn `phaseAmount` was part-way between the
  two looks' values, so the plate showed a ring of the wrong strength for the rest of the
  fade, or none that then appeared whole. `ringDip` (`lookFade.ts`, used by `lookFadeStep`
  when the change swaps the ring: Go, Back and Send to wall) takes the old look's amount
  to nothing before the swap, holds it there across a flat bottom (0.1 of the eased fade
  either side of the middle) and brings it up on the new look's own value after. The bottom
  is flat because the swap lands on a render frame, drawing whichever 33 ms tick came last,
  and the handoff's clock starts before the fade's: a pointed V still drew **0.090** of the
  amount at the swap (Magnet Garden to Classic) one tick before the middle, which a first
  version of the check missed by sampling only half a tick. Measured as the largest amount
  drawn anywhere within a tick either side of the swap: **0.852 before (Magnet Garden to
  Ferro Paint), 0.000 after** (bar 0.01). A slider the player is holding keeps its own
  value on a Back (`held`, as every other setting does); on a Go it is overwritten, as it
  was. A fade under a second (a set item can ask for 0.5) keeps its straight line, because
  the handoff never runs shorter than a second and the dip would be over before the swap.
  A magnet held over ferrofluid, or a pour from the bottle, turns Ferrofluid up whenever the
  amount reads 0, so both wait while a look is fading (`magnetInHand`, `ferrofluidPoured`);
  otherwise they would write 0.6 into the bottom of every dip.

The patch crossfade is in `blendLooks` itself, so a new song's look and Lucky get it too;
only the ring's dip is limited to the changes that run the handoff. Those unattended changes
keep the ring's amount on a straight line, since they have no swap to hide, and a control in
`desk` proves it (the two jump checks fail on the old `lookFade.ts`: 46 of 48 pass there).

What is not fixed is PLAN 28j-2 to 28j-5.

## 28k. Splodascope: a crowd of oil drops that do not merge (asked 2026-10-25)

**28k-1. Film Hold and the Splodascope look** (shipped). The owner sent a photograph of a
splodascope (round cells of yellow, green, red and pink oil packed edge to edge in blue water,
some inside others) and asked for a look like it, or the physics fixed if the plate could not.

It could not. Laid as Clock Glass lays its oil, a crowd of 90 drops was 25 bodies after two
seconds and 11 after ten (lab, 192²), and every merge mixed its colours toward brown. Two
things merged them. Cahn–Hilliard charges only for boundary, so two edges a few cells apart
are cheaper as none and the part-oil between them fills in; and the capillary force is taken
from the oil blurred five cells wide (mixSmooth), which reads two close drops as one body
with a waist whose curvature pulls the waist shut. That second one is the numerical
coalescence every smoothed-interface solver has: a pair of drops two cells apart, held still,
were one body in a second even with an energy for the film many times the double well's.

Real drops hold apart because the soapy water between them pushes back as it thins (the
disjoining pressure, Derjaguin's Π(h)), so Film Hold models both halves of it. In the oil's
chemical potential (`mixMu`), an energy for water that has oil on both sides of it along a
line within FILM_REACH cells, falling by e every FILM_DECAY cells, so oil flows back out of a
thinning film. On the flow (`mixFilm`), the near-contact force of Montessori, Lauricella,
Tirelli and Succi (J. Fluid Mech. 872, 2019): each edge cell looks out along its normal
through the water, and where another edge faces it, it is pushed back into its own drop,
harder the thinner the film. The pair two cells apart then held a film of c ≈ 0.1 for the
whole run. Two fixes came from `npm run filmhold`'s lone drop: part-oil cells counted as oil
saw a lone drop's own edge on both sides along its tangent (0.081 of a cell's oil changed),
and oil cells on the edge counted as film (0.026); with only oil past 0.55 counted and only
water in a film, a lone drop is identical to the last bit with the hold on and off.

The look (`src/lib/oilLay.ts`, seedPreset's 'splodascope') lays a log-normal crowd biggest
first by random sequential packing, a film apart, yellow two drops in five, with a compound
drop (a ring of water and a drop of another colour) in every other big one, at under half
Clock Glass's dye so yellow over the cobalt reads green rather than black; the bowed glass
(Plate Curve 0.45) gathers them and they pack into faceted cells as in the photograph. Its
sound patch is fast readings only: a kick presses the glass, which past what a film holds
merges a few neighbours. `npm run filmhold`: 35 → 31 bodies in six seconds with the hold,
35 → 3 without; no oil made or lost; the films not driven below empty (−0.014 at worst); a
lone drop unchanged. At the app's own grids, in the lab: 35 of 35 for four seconds at 384²,
33 of 35 for ten at 256². Pictures in the project's shared files, `splodascope/`.

## 29. The closeup's ferrofluid drop

### 29a. The drop as a bead with the light on it (this PR)

Asked 2026-10-11 ("I want to see much more 3d drops ... a drop of ferro fluid with light
reflecting off of it"). The closeup drew a flat black disc, its inside one value of black to
the byte: the solver carries the ferrofluid as a layer of one depth, so there was no surface
to light.

Built: the ferrofluid's surface solved each frame of the closeup (`src/gpu/ferroDrop.ts`,
`wgsl/ferroDrop.ts`): the ferrohydrostatic Young–Laplace balance h − ∇²h = P + K in l_c
(Rosensweig §5.2), the contact line the solver's own half-full line, the plateau
2 sin(θ/2) from the contact angle, the magnet's Kelvin pressure moving the volume
toward it. Drawn as a camera sees it: Fresnel off the ferrofluid from under the water
(n 1.52, 0.45% straight on), a softbox and a strip light and a dim tent through the top
glass by Snell, total reflection past 48.6° showing the plate round the drop, and the
dye over the drop filtering the reflection as the column above it, 2(gap − h). Relief /
3D is the contact angle (0 flat as before, 1 a bead at 160°; 0.7 is 112°). Only in the
closeup, only on the lead plate; the projected plate is unchanged to the byte (`npm run
ferrodrop`). Its shortcuts are open as 29a-1 to 29a-7 in `PLAN.md`.

Measured (`npm run ferrodrop`, 10 checks): the middle 1.460 l_c against the balance's 1.510
for a drop 4 l_c across at 112°; one l_c in from the edge 61% of the top; a magnet off the
right side stands that shoulder 138% and the far one 78%, the volume 101.8%; the light's
spread inside the drop 1 of 255 flat, 177 at Relief / 3D 0.7, its brightest up and left; a
yellow over it takes the highlight's blue 183 → 2 and its red 209 → 165; the 1x plate 0
bytes different at any relief.

### 29c. The drop follows the hand and holds together (#373)

Reported 2026-10-11 (the handoff's `drag-today.png`): a magnet at 0.35–0.5, height 0.2,
walked at a tenth of the plate a second turned the closeup's drop into a crescent, then
smeared it to brown with no cell over half full within two seconds; a look's own magnet
left it behind. A real 6 mm drop under a dragged magnet holds together and heaps toward
the field.

Found, in three rounds of review and a takeover:
- **The rim held the drop back.** The force on a cell is φ·∇ψ (the Kelvin force on the
  ferrofluid's share) but hsPrep's drag is the two liquids' geometric mean by share, right
  for the pressure's flow across a mixed cell and wrong for a force on one liquid alone: a
  half-full rim cell was driven at a quarter of a full cell's speed per unit of ferrofluid
  (ν_clear/ν_ff 4.5: 0.5·4.5^0.5 against 4.5). Measured in the lab (the handoff's
  `dropdiag`, a drop eight cells across, 384², main's gain): the core went at Darcy's speed
  for a sharp drop, 0.0123 of the plate a second under a weak magnet, the rim at 0.55 of
  it, the centroid at 0.44 of the pull asked; under a strong one 0.085, 0.76 and 0.29, the
  back rim drawn into the crescent. Two liquids side by side in the gap each go at their own
  Darcy speed under the one pressure, so the force is now read against the ferrofluid's own
  drag, (ν_clear/ν_ff)^(1−φ) on phaseForce's force: the rim at 0.81 of the core, the
  centroid at 0.68 of the pull asked (0.83 of the sharp drop's) under the weak magnet, and
  0.101 of the plate a second under the strong one where it was 0.075.
- **The flux step spread the moving edge** (MUSCL with minmod, half a cell times the
  cells moved): 100 cells past half → 0 over a 0.3-plate drag, which steepening the
  double well 2.9 times did not hold. Weller's interface compression takes it back along
  the edge's normal at the flow's own speed (phaseCompress, 29c-1), from the field blurred
  once a step (phaseBlur; blurred face by face it read 216 cells a cell and cost every
  ferrofluid look a fifth of its step on the Mac, 29.2 → 35.7 ms). Its first form compressed
  every moving face alike and sharpened a smooth pool the limiter had not spread:
  `ferropress`'s pool came back fuller after the lift (worst ring 0.049 against the 0.03 bar;
  main's 0.012; 0.008 with the compression off), the same in every arm of the drift and the
  momentum tried. Each face's compression is now scaled by the share of its slope the
  limiter withheld (`withheld`: 1 − minmod(Δ_up, Δ_f)/Δ_f, the same two slopes phaseAdvect
  limits; a few per cent on a smooth pool, 1 at a drop's shoulders), and the ring is
  0.003. Run on the deep plate too, the first form broke spikes (2/6), maze (3/4) and
  fingers (3/4) on the Mac, whose bars were measured with the spreading; so the compression
  is the thin gap's only and the deep plate is main's step (open under 29c-1).
- **The gain.** Antigravity's 1.04e-4 (17× main's) passed `ferrodrag` by running on the
  per-step guard, which makes the force uniform over the drop (every cell at the cap, so the
  drop moves as a body at 0.42 of the cap), and turned `fingers` 1/4, `ferrodye` 4/5 and
  `ferropour` 7/8 red on the Mac. `npm run magnetgain` works the pull out in SI from the
  shader's own field (held to Biot–Savart within 0.004%): EFH1's far-field gain is 5.8e-5
  at Ferrotec's χ 2.64, and the near field is the guard at any gain the plate has had (the
  hand's magnet asks 7.8 plate widths a second at 6e-6 against the guard's 0.375 on 384²).
  MAGNET_GAIN stays 6e-6, a tenth of the physics, named with its reason (29c-2: the looks'
  far pools, and the contact line's pinning the solver lacks); the guard is named as the
  hand's speed limit (29c-5); the saturation knee (29c-3) and the projection's one
  mobility (29c-6) are the shortcuts left.
- **The ferrofluid's momentum stayed behind.** With the rim's force in, the dragged drop
  still fell behind, 2.78R at 3 s and 5.8R at 6 s with no equilibrium: it topped out at 0.09
  of the plate a second under a pull whose Darcy speed was 0.19, where under a weak magnet,
  slow enough to keep up with its own momentum, it went at 0.95 of Darcy's. A thin gap does
  not carry the velocity along itself (`wgsl/thinGap.ts`, right for the oils, whose drag
  takes a push in a few steps), but the ferrofluid's drag time in the rest gap is 0.6 s, 36
  steps, and a drop dragged at the hand's speed crosses its own width in 30: every cell it
  entered held the oil's velocity, and the pull brought it up at 2.8% of the shortfall a
  step. Weighed against the drag the dropped term, ρ(u·∇)u, is Uτ/R, 2.5 for this drop
  where the oils are under a tenth. phaseMomentum carries the velocity along itself by the
  ferrofluid's share of each cell, before the step's forces (its momentum φu over its share
  where the trace lands; the oil's part reads as it was; a look without ferrofluid runs the
  step as before): the drop reaches the magnet's speed, 0.099 of the plate a second, and its
  lag settles at 1.85R. `phaseMomentum: 0` runs the step without it, the lab's control.
- **The resting drop leaked into its halo (`phaseCHVolume`, 29c-7).** The thin gap's
  Cahn–Hilliard step used a constant mobility at Cahn number ≈ 0.5 (an eight-cell drop on
  384², `R = 0.022`, `phaseSharp = 0.75`), so the curved interface's Gibbs–Thomson chemical
  potential shifted the bulk equilibrium to `c_eq ≈ 0.021` and drove ferrofluid out through
  the clear oil at `2·M·dt` per substep. At rest with no magnet (`npm run ferrorest`), the
  drop's half-full cells fell `100 → 84` over the 180 steps after the 20-step settle
  (`116 → 84` from pour), its peak fell `0.996 → 0.946`, and its halo of cells over `0.01`
  grew by `+248` (`352 → 600`, from `222` as poured), step for step as on `main` with
  `thinGap: 1`; a dragged drop continually left that halo behind in fresh oil and re-made it
  as it moved, losing about half its ferrofluid (`352 → 1602` cells over `0.01`).
  `phaseCHVolume` now multiplies each face's flux by the degenerate mobility
  `mob = 4m(1 − m)` at the face's mean share `m = ½(c_p + c_q)`, with no floor (Elliott &
  Garcke 1996): antisymmetric across each face so `Σc·h` is conserved (to `0.011%` over 180
  steps, against a `9.8%` loss when evaluated at `c_p` alone), at most `1` so the explicit
  stability limit (`≤ M_0`) is unchanged, and zero in pure oil and pure ferrofluid. At rest
  (`npm run ferrorest`, 4/4) the drop holds `90` of `100` half-full cells, its peak holds
  `0.975`, and its halo grows by `+94` (`324 → 418`), while on the dragged drop the cells
  over `0.01` fall from `1602` to `1238`. The deep plate's `phaseCH` stays as on `main`
  (29c-1).
- **The carry's wake and the trailing rim (29c-4, 29c-8).** With the limiter-matched
  compression and degenerate mobility in place, a dragged drop (`npm run ferrodrag`: `0.3` of
  the plate in 3 s under a `0.4` magnet at depth `0.2`) still loses its trailing rim to the
  oil's dipole return flow (`ferrodrag` 1/3: lag `3.24R`, half-full cells `100 → 0`, cells
  over `0.01` `324 → 1238`). The step has one velocity a cell, the mixture's
  `u_mix = φu_ff + (1 − φ)u_oil`, and where the back rim thins the oil closing in behind the
  drop dominates `u_mix` and carries that faint ferrofluid into the wake. Two forms of a
  separate ferrofluid carry were tried and dropped (29c-4). The first was a switch, the
  body's Gaussian mean in place of the mixture's velocity in every rim cell (`phaseVelocity`),
  and it failed the press: a mean is biased towards where the body is, and under the glass's
  squeeze (`u ∝ r`) a rim cell read the body's slower velocity from inside it and was carried
  slower than the liquid it is part of, so the pool packed (`ferropress`'s middle `1.025` of
  full with the glass down, main `0.960`, the bar 3% of `0.956`; the lift's ring `0.046`, bar
  `0.03`), and on the Mac's GPU the switch's patchy field raised 23 domes with no magnet
  (`spikes`) and lost a finger and a maze (3 of 4 each). The second was a first-order
  least-squares fit of the body's velocity and its two gradients (exact for a translation, a
  squeeze and a rotation), applied as a drift flux `φ(1 − φ)(u_ff − u_mix)` (`phaseDrift`):
  the compression's first form hid its shortfall by packing the shed rim back on (lag `1.62R`,
  half-full area `102` of `100`); matched to the limiter, the blend's drop shed three fifths
  of itself (lag `2.49R`, half-full area `32`). So the carry is the mixture's velocity again,
  and the trailing-rim loss is open as **29c-8** (`npm run ferrodrag` stays out of CI as
  known red until 29c-8).
- `phaseMu` and `mazeReady` run as on main (maze and spikes only); the first rounds had them
  on every ferrofluid look.

Checks: `npm run ferrorest` (new, lab, on the Mac's `open` shard; 4/4: half-full cells
`116 → 100 → 90` over 20 settling and 180 resting steps, `90.0%` kept against the `>= 88%`
bar where constant mobility falls to `84`; peak `0.996 → 1.000 → 0.975`, bar `>= 0.96` where
constant mobility falls to `0.946`; halo cells over `0.01` `222 → 324 → 418`, `+94` against
the `<= +120` bar where constant mobility grows `+248`, `352 → 600`; volume `Σc·h`
`3.36244 → 3.36248 → 3.36286`, `+0.011%` drift against `0.1%` bar where cell-centred mobility
loses `9.8%`; centroid moved `0.010` cells, bar `< 0.5` cells) and `npm run magnetgain` (new,
lab, on `fifth`; 5/5: the field within `0.004%` of Biot–Savart over 905 points, the weak
field's ∇ψ the linear Kelvin force within `5%` at `11.461` against `11.461`, `MAGNET_GAIN`
`6e-6` at `0.104` of `GAIN_phys` `5.775e-5` s, the drop at `0.0114` vs `0.0130` plate/s
(`-13%`, bar `34%`) of the two-phase Darcy speed under a weak magnet, and the dragged magnet
under the per-step guard at its steepest cell, `0.262` vs `0.375` plate/s on `384²`).
`npm run ferropress` is 7/7 (`worst ring 0.002` on the Mac, `0.004` on software WebGPU, bar
`0.03`, where #373's third head had `0.049` and main `0.012`; the middle with the glass down
`0.968 → 0.981`, volume `0.01570 → 0.01570`). `npm run ferrodrag` (new script, out of CI
until 29c-8) is 1/3 (`lag 3.24R`, `half-full 100 → 0`, `moved 0.010 cells`).

Fix round after the review of 0580eaa (six asks): `magnetgain`'s weak-field line is renamed to what
it tests (a units check on ψ, the gain cancels there); the drop checks apply the shader's rim factor
`share·(ν_clear/ν_ff)^(1−φ)` per cell before the per-step cap, which moved the strong drop from `-22%`
to `+4%` and the weak one to `-6%` (software WebGPU), both under a 20% bar (the weak one was 34%);
`ferrorest` reads a second window (steps 200 to 380: its loss at most half the first's, or 3 cells) and
calls its centroid line a symmetry guard; `npm run ferrohold` (new, `fifth` shard) holds the momentum
pass and the compression pass on the dragged drop over steps 60 to 120, each switched off by hand
turning red its own line (lead `2.01R` → `2.28R` against `2.15R`; half-full `60.3` → `34.4` against `47`),
and the script runs both off-scenes itself and requires each pass worth half its measured gap
(`0.13R`, `13` cells), with a solver-read start guard (centroid over `0.40`); `ferrorest` line 5 is
signed (a second window that gains over 3 cells is red too) and line 3 also holds Σc·h at step 380;
`docs/judging.md` §54 says what the rim pull and `phaseMomentum` look like.

**29c-8. Two-phase carry at the trailing rim (#495).** Chosen fix: a **two-phase carry**
(`phaseVelocity` in `src/gpu/wgsl/fluid.ts`, writing `this.phaseVelT` read by `phaseAdvect`,
`phaseAdvectPlan` and `phaseCompress` while `this.vel` remains the mixture velocity for the dye, oil
and `phaseMomentum`), chosen over a pre-projection Korteweg or sub-grid contact-line force because
any force added before `hsProject` still leaves a single projected cell velocity
`u_mix = φ·u_ff + (1 − φ)·u_oil` shared by both phases (and any curl-free edge force is removed by
the pressure projection). Where the back rim of a dragged drop thins below half full, the displaced
oil's dipole return flow dominates `u_mix` and turns it backward into the wake; carrying the
ferrofluid phase with its own velocity `u_ff` keeps the trailing rim moving with the drop.
Named shortcut: instead of solving two coupled momentum and Darcy-projection equations for `u_ff`
and `u_oil` across the diffuse interface (queued as `PLAN.md` **29c-9**), `phaseVelocity`
reconstructs the local drop velocity `u_m` and centre-of-mass offset `x_m` from the half-full body
(`φ >= 0.50`) within an 11-cell Gaussian window (`w = ((φ − 0.50)/0.50)·exp(−r²/64)`), gated off on
labyrinth and standing-spike scenes (`cohere = (1 − 2·maze)·(1 − spikeAmt)` while `!filmHeld`) so an
11-cell window never bridges the 2–4 cell valleys between standing domes or labyrinth fingers
(`spikes` 6/6, `maze` 4/4, `fingers` 4/4, `domes` 4/4). Leaving `v` untouched whenever
`dot(v.xy, u_m) >= |u_m|²` makes the pass a no-op on radial squeeze flows under a press where
`|u(r)| ∝ r` (`ferropress` 7/7: middle `0.968 → 0.981`, worst ring `0.012`), and weighting the
carry by `along = dot(x_m, u_m)/|u_m|` carries the trailing rim (`along > 0`, `φ < 0.96`) at `u_m`
while carrying only the outer leading toe (`along < 0`, `φ < 0.49`) so the front half-full contour
keeps its Taylor–Saffman two-liquid Darcy speed (`magnetgain` 5/5: `+2%` weak, `+3%` strong) and
MUSCL shear (`ferrohold` 5/5: mean lead `1.69R` vs `1.93R` with `phaseMomentum` off, `+0.24R` against
`0.13R`; mean half-full `107.6` vs `92.6` with `phaseCompress` off, `+15.0` against `13`). On the Mac
GPU, `npm run ferrodrag` reaches **3/3** (lag `1.82R` against `2.0R`, half-full cells `100 → 106`,
`106.0%` kept against `±15%`, cells over `0.01` `324 → 378` vs `1238` on `main`, stationary control
`0.010` cells). Per the 29c-8 brief, `ferrodrag` was not added to `checks.yml` in #495.
The review found one hole, fixed in the same PR: `runPhaseAdvect` chose `phaseVelT` whenever the thin
solve's buffers existed, and they outlive Thin Gap, so with Thin Gap switched off after a drag the deep
plate kept carrying the ferrofluid on the last thin step's velocity (magnet off, the drop slid `0.0425`
of the plate in 120 steps and smeared to `0` half-full cells). It now asks the step's own `thinLive`
(`0.6206 → 0.6241`, `104 → 94` half-full); the check for it is PLAN 29c-10.

**29c-10. `ferrodrag` in CI, and `ferrohold` over the whole drag (#521).** `npm run ferrodrag` is an
entry in `scripts/checks.json` on the `show` shard (the lightest on #495's run, 14.2 minutes of 20;
the check takes 39 s there): on Metal lag `1.82R`, `106.0%` kept, stationary `0.010` cells, 3/3.

A fourth line was written for the review's `runPhaseAdvect` fix: the dragged drop at step 180, Thin
Gap off and the magnet away, 120 deep steps, the drop held to less than one radius of movement and at
least half its half-full cells, with a fifth that runs the same on a lab built with `runPhaseAdvect`
keyed off `hsP` alone (#495's head before its review) and requires it red. On software WebGPU the two
separate: real `0.16R`, `104 → 94` (cx `0.6235 0.6237 0.6239 0.6241` every 30 steps); control `1.93R`,
`104 → 0` (half-full `100 78 8 0`). On Metal both read `0.70R`, so the two lines run by hand
(`-- --thinoff`) until PLAN 29c-11 finds why.

`ferrohold`'s window was steps 60 to 120 because the rim used to go in the second half of the drag.
Read there after #495, both absolute bars were passed by the runs they were set to fail (lead `1.93R`
with `phaseMomentum` off against `2.15R`; `92.6` half-full with `phaseCompress` off against `47`), and
the compression pass's margin was `15.0` cells on Metal and `13.4` on software against `13`. Over steps
60 to 180: lead `1.72R` on, `2.06R` with `phaseMomentum` off; half-full `105.8` on, `82.0` with
`phaseCompress` off (software; Metal `1.74R`, `2.07R`, `105.8`, `82.2`). The window is now the drag,
`LAG_BAR` `2.15 → 1.89` and `HALF_BAR` `47 → 94` (midway), `DLAG_BAR` `0.13 → 0.16` (half the gap),
`DHALF_BAR` kept at `13` (gap `23.8`).

## 32. The soap film: a draining film seen in reflection

### 32a. The CPU reference (#403)

Built `src/lib/soapFilm.ts` (`createSoapFilm`, `stepSoapFilm`, `soapFilmRgb`), added the
sixth argument `cosI = 1` to `filmReflectance` (and optional `cosI = 1` to `filmColour`)
in `src/lib/filmTable.ts`, and wired `npm run soapfilm` into `.github/workflows/checks.yml`
under `Measure · logic`.

Method: 2D incompressible Darcy buoyancy flow `u = (1/ζ)(−∇p + ρ g (h − h̄) ŷ)` with
`∇·u = 0` on a staggered MAC grid (`ρ g = 9810`, `ζ = 1.5`, default `dx = 1e-3` m),
Gauss-Seidel projection with over-relaxation (`f.uf` and `f.vf` exposed on the cell faces,
zero at all four walls), conservative second-order minmod-limited advection of `h`,
constant evaporation (`evap` nm/s), and exponential relaxation (`τ = 0.5` s) to the 8 nm
Newton-black film once a cell thins below 30 nm without refilling. Named shortcuts (a)–(e)
are documented in `PLAN.md` §32 and `src/lib/soapFilm.ts`.

Measured: `npm run soapfilm` 23/23 (C1 thick patch down 29.4 rows, thin patch up 22.6 rows;
C2 mass drift 3.3e-15, uniform film 0.0e+0 nm; C3 `g = 0` 0.0e+0 nm, half-gravity ratio
0.54, reversed gravity −20.9 rows; C4 peak excess at 5 s 663/800 nm, mass ratio 0.77,
max `|∇·u|` 9.2e-5 /s against 1.9e-3 /s, 0.00% of cells outside face flux interval, wall
flow 0; C5 550 nm first max 103.5 nm at 0°, 111.5 nm at 30°, 126.5 nm at 50°, Airy
agreement 8.3e-17, table and angle match 0.00/255; C6 quarter means ordered from 30 s,
top reaches 10% black first at 115 s, no ruptured cell refills; C7 4 consecutive 5 s
samples in the photograph window, at t=120 s 5.1% under 30 nm, 23.3% dark, 79% saturated,
9/12 hue sectors); `npm run filmtable` 8/8; 600 steps of the 32×64 film in 0.69 s.

### 32b. The reflected view (this PR, #469)

Extended `soapFilmRgb` in `src/lib/soapFilm.ts` so a 2D draining vertical film (`ny > 1`, or
`softBox: true`) is read in reflected light at viewing angle `cosI` on a dark ground
(`ground = 0.0004` through transmittance `1 − R`), where Snell's law sets the internal path
thickness `d_eff = h cos θ_t` and Airy reflectance is summed over a 4-point path spread
(`spread = 0.025`) around `d_eff` before clamping negative linear sRGB channels to 0. That
4-point path spread and dark ground alone move C7's `t = 120` s saturation by two points from
32a's 79% down to 77% (dark 22.7%, 9/12 hues). The rest of the drop to the photograph's 15%
saturated is a colour grade (`notchFloor = 0.0725` lifting each pixel's lowest linear channel
and `chromaRetention = 0.67` pulling each channel a third of the way toward grey while
rescaling to preserve luminous reflectance `Y(d_eff)`) standing in for the soft box's angular
spread and the camera's gamut, not the physics itself: with the grade off (`notchFloor = 0`,
`chromaRetention = 1`) saturation at `t = 120` s is 77% (dark 22.7%, 9/12 hues), and with the
grade on it is 13% at `t = 120` s (14.8% at `t = 110` s, dark 19.4%, 8/12 hues) against the
photograph's 15% saturated and 9/12 hues. A 1-row calibration strip (`ny === 1` with `softBox`
unset) continues to read the raw point-source `filmColour` table directly. Named shortcut (f)
(normal-incidence Fresnel amplitudes kept at all angles, no s/p split; plus `notchFloor` and
`chromaRetention` as a colour grade standing in for the soft box's solid-angle spread and
camera gamut) in `PLAN.md` §32 and `src/lib/soapFilm.ts`, and queued `PLAN.md` 32b-1 to replace
the grade with the solid-angle integral over `cosI` (with s/p Fresnel terms) and camera gamut
mapping.

Measured: `npm run soapfilm` 23/23 with C7's saturation bar unchanged (`4 samples in a row
(5 s apart)` across `t = 105..120` s: at `t = 105` s saturated 17.2%, silver 10.7%, dark 9.5%,
black 0.8%; at `t = 110` s saturated 14.8%, silver 8.1%, dark 12.3%, black 1.5%; at `t = 115` s
saturated 12.5%, silver 7.4%, dark 16.6%, black 2.5%; at `t = 120` s film under 30 nm 5.1%,
dark 19.4%, saturated 13%, silver 10.2%, 8/12 hues — against the photograph's 15% saturated,
10.9% silver, 14.3% dark, 1.1% black, 9/12 hues; control with `notchFloor = 0` and
`chromaRetention = 1` gives 77% saturated, 22.7% dark, 9/12 hues at `t = 120` s);
`npm run filmtable` 8/8. Three-angle render of the `t = 115` s film at `0°`, `30°` and `50°`
(`cos θ_t = 1.000, 0.927, 0.817`): the Newton-black lace (`< 30` nm, `luma < 0.12`) stays
pinned at the top (`centroid row = 1.00, 1.01, 1.09`), while the first-order purple dark
fringe (`d_eff ≈ 200` nm) shifts down from row 27 (`h = 206.7` nm) at `0°` to row 28
(`h = 208.6` nm) at `30°` to row 45 (`h = 246.0` nm) at `50°`, and the second-order green-gold
peak (`d_eff ≈ 320` nm) shifts down from row 71 (`h = 319.9` nm) at `0°` to row 78
(`h = 353.1` nm) at `30°` to row 84 (`h = 393.2` nm) at `50°`.

### 32c. The GPU solver (this PR, #505)

Built `src/gpu/soapFilm.ts` (`createSoapFilmGpu(device, { nx, ny, dx })` with `write(h)`,
`step(dt, { g, evap, zeta })`, `read() → { h, uf, vf }` and `destroy()`) and its compute
shaders in `src/gpu/wgsl/soapFilm.ts` (`soapSetup`, `soapSorRed`, `soapSorBlack`, `soapProject`,
`soapTransport`), implementing the CPU reference (`src/lib/soapFilm.ts`, `stepSoapFilm`) pass
for pass on the GPU under the contract in `scripts/soapgpu-cpu.ts`:
- `soapSetup`: marks cells with `h < 30` nm (`BLACK_THRESHOLD_NM`) as ruptured, reduces the
  film's mean thickness `hbar` (and mean-centres `p` when warm-started so float32 gauge drift
  cannot accumulate over thousands of steps), evaluates unprojected vertical Darcy buoyancy
  `v* = (rho * g / zeta) * (h_face - hbar) * 1e-9` on the interior horizontal faces
  (`j = 1 .. ny - 1`) with all four walls shut, reduces `maxStar = max |v*|`, and forms the
  unprojected cell divergence `rhs_ij = vf*[j+1, i] - vf*[j, i]` (or zeroes `uf`, `vf`, `p`
  and `rhs` when `maxStar <= 1e-18`).
- `soapSorRed` / `soapSorBlack`: solves `deg_ij * p_ij - sum_neighbours(p) = -rhs_ij` on the
  staggered MAC grid by red-black SOR with `omega = 2 / (1 + sin(pi / max(nx, ny)))`,
  warm-started from the previous step's tension `p` (60 sweeps warm, 80 sweeps cold when `g`
  changes or `write(h)` lays a fresh film).
- `soapProject`: projects interior MAC face velocities `uf[i, j] = -(p[i, j] - p[i-1, j])`
  and `vf[i, j] = vf*[i, j] - (p[i, j] - p[i, j-1])` with walls zero, reduces `uMax`, and
  sets the CFL sub-step count `steps = max(1, ceil(uMax * dt / (0.45 * dx)))`.
- `soapTransport`: advances `h` through `steps` conservative flux-form sub-steps using
  second-order upwind reconstruction with the minmod limiter (`sx`, `sy`), computing each
  shared face flux (`fx`, `fy`) once for both adjacent cells and blocking inflow into ruptured
  cells when `evap > 0`, followed by uniform evaporation (`evap` nm/s) and exponential
  relaxation (`BLACK_RELAX_TAU = 0.5` s) of ruptured cells (`< 30` nm) toward Newton black
  (`8` nm).
- Constants (`RHO_WATER = 1000`, `DEFAULT_ZETA = 1.5`, `BLACK_THRESHOLD_NM = 30`,
  `NEWTON_BLACK_NM = 8`, `BLACK_RELAX_TAU = 0.5`) are copied under the same names rather than
  imported from `src/lib/soapFilm.ts`, so the GPU solver's bundle carries 0 bytes of the CPU
  reference.
- Wired `npm run soapgpu` into `scripts/checks.json` on the Mac `plate` shard beside `sloshgpu`,
  and `npm run soapgpu -- --selftest` into `Measure`'s `lab` shard beside `sloshgpu` (in `lab`
  rather than `logic` because `scripts/soapgpu.mjs` calls `openLab` to launch Chromium and
  request a WebGPU adapter even under `--selftest`, and `checks.yml` installs Chromium only on
  the `browser` and `lab` shards).

Measured: `npm run soapgpu` 29/29 on `apple metal-3` (first-step face flows RMS diff 0.195%
within 2%, thickness change 1.116% within 5%; 1 s thickness RMS diff 0.065% at `dt = 0.05` s,
0.022% at `dt = 1/60` s, and 0.884% at `zeta = 0.25, dt = 0.2` s across 4 CFL sub-steps; C1
thick patch +29.41 vs +29.41 rows, thin patch −22.56 vs −22.55 rows; C4 excess 83%, mass 0.77,
max `|div u|` 1.8e-4 /s against 1.9e-3 /s, 0.00% of cells outside face fluxes, wall flow 0; C2
mass drift 7.0e-9, uniform film 0.0e+0 nm; C3 `g = 0` 0.0e+0 nm, half-gravity ratio 0.54,
reversed −20.86 vs −20.85 rows; C6 quarter means ordered from 30 s, worst quarter mean diff
0.08%, top 10% black at 115 s vs 115 s, 0 refilled on the drain or on the torn hole, black hole
spread 160 vs 160 cells; 0 of 4785 steps idle, 0 of 514 reads idle; `src/lib/soapFilm.ts` not in
bundle; 0 WebGPU errors; `cost: 2.44 ms a step at 256 × 256 on apple metal-3`); `npm run soapgpu
-- --selftest` 29/29 (`cost: 189.18 ms a step at 256 × 256`); `npm run soapfilm` 23/23; `npm run
wgsl` 142 shaders; `npm run physics` 20/20; `npm run derive` 4/4.


## 33. Bubbles and the closeup, per liquid

### 33a. No stepped ring round a bubble's hole (this PR)

*Reported* (the owner, 2026-10-19): "bubbles still look really pixelated around
themselves". In the lab every hole the air cut in the dye wore a stepped halo a couple
of cells out, bright and dark blocks on a cross, a "+" stamped round each small bubble.
The dye field under it was clean, and with Boundary Contrast at 0 the halo went.

*Cause:* the line drawn between two dyes (`boundaryDiff` in `src/gpu/wgsl/plate.ts`,
on at 0.35 in every look) is drawn where the lit colour changes across a four-tap
cross, and the lit colour carries the dye's depth as well as its hue. One dye thinning
to nothing at a hole's edge read as two colours meeting; the taps' offsets drew the
cross.

*Fix:* the line is gated by how far the dye's colour per unit of dye moves between the
same taps (`dyeHue`, the unit colour exp(−rgb/a) of the decoded dye, white where the
dye is empty), smoothstep 0.03 to 0.12. A hole in one dye does not move it; two dyes
meeting do, at any pair of depths. A gate on the density ratio was tried first and took
the line off two dyes meeting at depths five times apart, so it was dropped.

*Measured* (`npm run holeline`, the lab on SwiftShader, each picture against the same
plate with Boundary Contrast at 0): the share of a ring round holes of 1.8, 3, 5, 8 and
14 cells that the line moves by more than 24 levels went from 8.9, 8.9, 11.5, 13.6 and
18.3 % to 0 % each; the band where two dyes meet kept 52.8 % → 52.8 % at one depth and
61.1 % → 58.3 % at depths five times apart; a pool's rim into clear liquid, printed not
judged, 16.8 % → 0 %. The bubble's own drawing, which is the donut, is 33e.

### 33b. The soft glow round a hole (this PR)

*Reported* (the owner, 2026-10-19, via 33a's picture): after the stepped ring went, a pale
soft ring two to four cells wide stayed round every hole the air cuts in the dye.

*Cause, measured not inferred:* the lab's radial profile round a hole of 8 cells (green
channel, the real solver and plate shader, the bubbles' drawing at 0 and the air field
handed to the plate) was +9 to +15 levels over a 194 baseline at 9 to 13 cells, and flat
with Edge Relief at 0. It is the dye's own edge relief (`meniscus()`, and the lit slope
`applyLighting` takes from `sobelGrad`): the air's cut leaves a steep density ramp over
its 1.5-texel rim, and the relief lights that ramp as if the dye stood in a ridge. A
real hole's edge is the bubble's meniscus, which the bubble pass draws; the dye beside
it is flat. The boundary line and the lace contribute nothing to this glow (the line was
33a's).

*Fix:* `airNear` (`src/gpu/wgsl/plate.ts`, in the display-only `VIEW` part, because the
derive pass's module has no `air0`) is the air field's largest coverage over nine taps
within 4.5 cells (the Sobel taps at 3 cells plus the bicubic's spread), smoothstepped
0.02 to 0.3. Both layers' dye normals are blended to flat by it before they reach the
lighting and the meniscus. A dye's own edge into clear liquid is far from the air field
and is untouched.

*Measured* (`npm run holeline`, the lab on SwiftShader): the mean deviation of the dye
1 to 6 cells past a hole's rim from the dye 10 cells out, for holes of 1.8, 3, 5, 8 and
14 cells, went from 4.2, 6.0, 9.6, 11.0 and 10.4 levels (the check's second lab, with the
mask taken out) to 3.2, 2.4, 2.6, 2.4 and 2.5 (bar 6). Edge Relief itself, asked of the
first 3 cells beside the rim of the holes of 3 cells or more, moved the dye 11.9 to 22.9
levels before and 0.00 to 0.02 after (bar 1). A pool's edge relief into clear liquid moves
a pixel by 16.06 levels both ways (bar 0.8 of today's). `airlens` found its bubble box by
differencing a render with the bubbles on against one with them at 0, and the flattened
relief then showed in that difference; its off render now hands the plate the air field
too (`airField`), so it differences the bubbles alone.

*Named shortcuts:* `airNear` is a fixed reach, not one derived from the taps' real
footprint; the normal is flattened wholesale, so a real dye-to-dye step right beside a
bubble also loses its relief within the reach; only the lead layer's normal is masked
(the app cuts air in the lead layer's dye alone, and the back layer's coordinates differ
under a zoom or drift); the aside hole of `holeline` is a coarse guard on the mask's reach;
the lace (33c) and the boundary line
at a hole are not masked; the hole of 1.8 cells is only partly flattened (its relief
moves 4.6 levels where the control moves 5.5), because the nine taps find a hole that
small along few directions (PLAN 33b-3).

### 33e. The bubble as the projector throws it, not a donut (this PR)

The owner: bubbles "sometimes" draw as a donut. The report's picture is
`/mnt/project-files/drops/bubbles-2026-10-19/zh-sheet.png`.

*Cause:* the projected bubble (the plate's view, `plate.ts`) drew its clear middle as
the dye's own normalised hue at 41–77 % strength, in all eight clarities, inside the
dark band. On the default dark ground (dye is light on black) that is a dim dye-coloured
disc inside a black ring; on the lamp ground a tinted disc over a white hole; in clear
water a grey disc. Why it is "sometimes": a bubble in dye is a donut, a bubble in clear
water is a grey disc, and the closeup (the camera's bubble, a different branch) is
unaffected, so it depends on what the bubble sits in and on the zoom's crossing
(`dropCam`).

*Fix:* a slab of air does not tint light, so the middle is the plate there
(`outColor`), with at most a tenth of the wetting film's tint (`0.1·k1`). The band and
its width are unchanged (the big bubble's band was already half the gap, `airlens`).

*Measured* (`npm run bubblelook`, the lab on SwiftShader, bubbles of 3, 4.5, 7, 10 and
13 cells, the middle fifth of each radius against the same plate with Bubbles at 0): the
old line, put back by the check's second lab, left the middle 116–195 levels off the
plate on the dark ground (172, 151, 140, 119, 195 in green) and 174 or more on the lamp
ground; the shader leaves 0 on the dark ground and 0–21 on the lamp ground (the tenth of
the tint). The dark share of a bubble's area falls as it grows, 80, 85, 60, 46, 34 %
on the lamp ground. Bubbles at 0 and the closeup's bubble are byte-identical to the
control on both grounds.

*`airlens` had to move,* declared under *Check changes*: its plate is now the lamp ground
(`lampGround: 1`), because the window is the plate and on the dark ground a window is
black, so there was nothing lit to measure the lens against; its `on` render uses
Bubbles 1 (the compositing weight is `strength·mix(0.7, 1, filmT)`, so at 0.8 a quarter
of the plate shows through the band and the band read 25–28 % where it is drawn 10 %);
and its flat-window chroma bar compares the window with the plate's own chroma plus 4
(the lamp's warm white is 8.8 levels apart by itself; the bar was 4 when the ground was
grey). Every other `airlens` line and its numbers are unchanged: 10 of 10.

### 33g. The closeup: the liquid nearer and in relief, not cells (this PR)

*Reported* (the owner, 2026-10-19): "Macro zoom is also still not great. Things look like
a bunch of biological cells when you zoom in - this isn't right. I just want a closer and
more 3d view of the liquid on the plate."

*Cause:* the closeup drew `cellField` (concentric, packed Voronoi-like cells slid by a
flow map, 20c-1's named shortcut) and the lacing (dark filaments) over the dye, and both
were on in every look that did not name its own: `macroCells` 0.75 and `macroLacing` 0.55
were the defaults in `types.ts` (and random in the lucky roll). At 4x and 6x that is a
texture laid over whatever the dye was, which is exactly what reads as cells under a
microscope. The relief under it was also weak (the dye's normal ×5 under the plate's lamp
at its normal height), so what was left of the "3d" was the cells' own domes.

*Fix:* Paint Cells and Macro Lacing default to 0 (`types.ts`, `lucky.ts`). The code and
the sliders stay: a look that wants cells names them (`macro-bead`, `cell-bloom` and
`lace-run` still do). The relief block in `macroDetail` is relit as a surface seen
nearer: the lamp is lowered to 0.6 of its height so it rakes, the dye's normal is read
×14, the glint rolls off (`1 - exp(-1.6·spec)`) so a bright pool does not burn out, and
the boundary line is thinned by up to 80 % at full closeup, so a pool's edge is its
relief and not an outline. Nothing moves: the camera and its clock are as before
(`steadycam`, `cellride`).

*Shortcuts named:* the relief is the dye's gradient read as a dome under a lowered lamp,
not a physical height field (33g-2); the thinned boundary line is a taste choice; the
cells that remain are 20c-1's look-alike, opt-in.

*Measured* (`npm run macroview`, the lab on SwiftShader, and again on Metal in the CI `open` shard with the same result: relief 0.0386 to 0.051, smoothness 0.988 to 0.991, old-defaults control 0.1397 and 0.1693, nine seeded pools stirred at
256², 4x and 6x, defaults and `classic`, `jellyfish-bloom`, `oil-and-water`): the cells'
and lacing's own contribution to the frame (the frame against the same frame with both
at 0, over the frame's mean) was 0.14 at 4x and 0.17 at 6x on the old defaults, and is 0
on every shipped case (bar 0.01; the old defaults are the control, which must read over
five times the bar). The relief's contribution (against Macro Relief at 0) is 0.033–0.051
of the frame, and 0.99 of it lives at scales over 17 px, so it is a swell and a sheen,
not grain (bars 0.02 and 0.5; the old defaults' 0.76 smooth was the cells' grain). The
colour is the dye's: the mean CIE76 distance on (a*, b*) from the middle sixth of the 1x
frame to the 6x frame is 1.2–3.1 (bar 5; the control 3.25).

*The first draft of the check measured nothing,* and is why the final one is a
contribution test: an autocorrelation's secondary peak read 0.02 on the old defaults,
under its own 0.15 line, because the cells are irregular and have no lattice; a "relief
follows the dye" correlation came out negative; and a ΔE that includes lightness moved
14 on `lava-lamp` from the relief alone. Each was dropped for a line that failed on the
control before it was trusted on the fix.

## 34. What a competitor's page showed

### 34a. A landing page before the sign-in wall (2026-10-22)

What was reported: a first visit loaded the app ("Warming the lamp") and landed on a name over
three sign-in buttons. It said nothing of what ChromaGlass is or costs, and asked for an account
before the visitor had seen a drop of dye. A competitor's page (PLAN 34) showed the gap: a promise,
a price, pictures of the product, and a way in that needs no account.

What changed: `Landing.tsx` (its own chunk; the entry chunk grew 517 B gzipped against a 6000 B
bar, and the engine and Firebase are not in it) is drawn in the sign-in's place on a first visit to
the hosted site. A headline, one plain line, "Play free", the prices ("Home $35 · Pro $199 · one-time
payment, no subscription"), eight real looks from the app's own renders, four steps, what the free
site includes and what the app adds (read from `APP_FEATURE_TILES` and the free caps in
`tierGates.ts`, so the page says what the code does), a note from the maker and the refund line
(14 days, from the Terms). "Play free" mounts the sign-in over the page; the tab remembers it
(sessionStorage) because Google and Apple sign in by a redirect that reloads the page and the
sign-in is what collects it. The never-lock-out rule is untouched: the page exists only in the
gate's "signin" phase, before the app, and nothing after it unmounts the plate.

What was tried first and set aside: a looping video of the lab's plate for the hero. The lab lays
a few drops that barely move in a hero's seconds (four frames 150 solver steps apart were
near-identical), and a render took four minutes on SwiftShader. A cross-fade of five real frames
costs 40 KB and moves only by opacity and transform. A filmed loop is PLAN 34a-2.

Measured (`npm run signin` 16/16; `layout` 74/74; `panel` 192/192): Play free is 48 px tall at
1024 × 768, 390 × 844 and 844 × 390, with nothing wider than the screen; a returning visit's plate
comes up in 0.9 s against 1.1 s for a build with no sign-in; the landing is never drawn for a
returning visit nor for `?remote` and `?cast`.

### 34a-5. The page's words, rewritten (2026-10-28)

Asked: the owner wanted the landing page's words looked at again, and decided there is no free
beta of the paid app. The page never said "beta", but it did not say the free website was more
than a taste, never named the $164 upgrade, and its maker note and refund line gave no way to
reach anyone ("say so and I will make it right").

What changed, each line approved by the owner from a draft that put the old and new words side
by side with a reason: the headline says the show is played, not only that it moves ("A liquid
light show you play to your music."); the subline names both audiences, a gig and a living room;
the line under the buttons and the pricing paragraph say the website is free for good and not a
trial; the pricing paragraph names the upgrade's $164; the maker note and the refund line link
support@chromaglass.art; "the solver" became "the app" for a home listener; the search and share
descriptions follow the headline. The layout, tier lists, steps and look lines are untouched.

Measured: `npm run signin` 28/28 (the landing's own lines among them), `layout` 81/81; at 390 ×
844 and 1440 × 900 the page has 0 px of sideways overflow and the new headline fits the hero.

## 35. Clear controls: on reads on, one name for one thing

### 35a. One look for on, every name unique (2026-10-24)

Reported: the owner, with the Video panel open and a loop playing, could not tell which of
Load loop, Camera, Window and Off was on (all four were the same grey button; only Off changed,
by greying out), nor which demo loop was playing, and found several buttons called Video.

Measured on main (4397c83): an on or chosen control was drawn nine ways (white fill ×18, white
tint ×19, a brighter border ×8, the accent ×10, the active grey ×4, `bg-text` ×3, amber ×24, raw
purple ×4, and text alone). The shared `Segmented` drew its chosen item in the active grey,
1.19:1 against the panel it sits on. `npm run switches` passed every one: its bar, ΔE 20, is a
difference found by comparing two buttons, not one read off a single button. With a new bar of
3:1 in light (the fill's luminance ratio, or a ring only one state has), 58 of the 516 controls
it reads were under it. And a source read found 88 buttons that change their look with a state
and say no state at all, so neither the browser check nor a screen reader could see them.

What changed: one look for on, `lit` (`#7C4DEB`, 3.47:1 against elevated, white text on it
5.1:1), used by `Segmented`, a new `pressed` on `Button`, and `LIT` for a button a Button cannot
be; `LIVE`, solid red, for on that is live now (Blackout, recording); white stays the one primary
on a surface. The switch's track keeps the accent (3.5:1 against the off track where lit would be
2.9). Every stateful button says `aria-pressed`, `-selected`, `-checked` or `-current`. Backwards
ones turned round: the desk's Blackout (red while off, white while on), the drone (green while
stopped), the phone's and the remote's play button (pressed now means paused, lit), the remote's
second Blackout (red while off). The Film section's Source is one pick-one (Off, Video file,
Webcam, Window), each demo loop row has its own Film and Pour, lit while that loop is doing it,
with a "playing as film" tag (the row was a button with Pour as Dye a span inside it, and Load
Film a span with no handler). Names: Video section → Film, the header dot → Film (it was lit by
the poured video and opened the film), Camera section → Lens, the film's Camera source → Webcam,
the Dye panel's Video… → Pour a
video…, Macro/Wide → Close-up (pressed), the phone dock's Presets → Looks and Play → Motion, Play
screen → Simple screen, Wander on its own → Evolve. Test ids kept.

Shortcut hints off the buttons (the owner, the same afternoon, with Save's ⌘S chip sitting on its
dirty dot: "hover over is probably better for descriptions and shortcut hints"). `Button`'s `kbd`
and `Segmented`'s keys are now in the hover title and `aria-keyshortcuts`, not drawn as a chip;
the tool grid's letters, + Panel's ⌘P, Show deck's ⌥D and the header's ⌘K (now a magnifier) the
same. Menus and the command palette keep theirs at the row's right edge, where they overlap
nothing. The phone has no keys.

The source reader was reviewed by the check-skeptic before it shipped, which found it skipping
`sizeId` (a filter on the word size matched the name; now whole words), a condition with text
before it (`cn('x hover:y', on ? …)`), the second branch, named branches, `&&`, colours not on
its list (it now allows only the tokens) and a constant `aria-pressed={false}`. The browser bar
was made to count a fill only the right way round and in lit, live, ok or the accent, a part
inside only at 15% of the control or more, and a group as disabled only when every member is.

Checks: `npm run states` (new, in Measure) and `npm run switches`' lift bar. Numbers before and
after are in the PR.

### 35b. Seven groups, one vocabulary (2026-10-25)

Reported: the owner, 2026-10-24, "the grouping is bad": the same sections were sorted four ways
that did not agree, so the panel browser, the search and the phone's Settings disagreed about
where a thing is.

Measured on main (a7dd8e7): `data-group` in `SettingsPanel` said perform, setup, look, inputs or
stage (24 sections, read by nothing), `SETTINGS_CATEGORIES` said Live, Inputs, Look, Plate or
Stage, the panel browser borrowed those five and filed the desk's own panels under `live` and
`plate`, and the phone's Settings strip drew the same five with the headings hidden
(`hidden ... sm:block`), one flat run of 26 tabs.

What changed: `SETTINGS_CATEGORIES` is the one list, Play, Pour, Feed, Motion, Chemistry, Look,
Stage. Play: Master, Mixer and the desk's Cues, Rides, Recipe, Score. Pour: Bottles, Dyes, Tools,
Liquids, Manual Interaction. Feed: Sound, Motion camera, Film, Patches, Controller. Motion:
Kaleidoscope, Automation, Fluid Physics. Chemistry: Squish Plate. Look: Light Show Look, Show,
Lamp & Light, Film Stock, Lens, Macro Closeup. Stage: unchanged (Wall, Mapping, Logo & Titles,
Plates & LED, Simulation, Phone · iPad), so Build and Gig still keep it in the Stage sheet. The
rail, the panel browser and the desk's own panels read the list; each section's `data-group`
comes from it (`groupOf`); the phone's strip draws the seven headings. No section's id, controls
or place on the desk changed, so saved layouts, pins and deep links open as before. The Settings
guide names the seven. `desklayout` holds the list, every panel's group, the markup's
`data-group` and the Stage panels to their names; `phone` reads the seven headings drawn at phone
width.

Squish Plate keeps its name and its 45 controls in Chemistry: splitting it is 35c (done in 35c-1, below).

### 35c-1. Squish Plate in five (shipped 2026-10-25)

The owner's complaint was that the plate's panel held forty-five controls under one name, and the
desk made it worse: thirty of its pins were filed under Fluid Physics while the sheet drew them under
Squish Plate, so Fluid Physics' knobs on the deck were the glass's, the oil's and the magnet's.

What changed. Chemistry: Squish Plate keeps the glass (Plate Pressure, Plate Shape, Depth Drag, Thin
Gap, Thickness, Press Lift, Glass Smear, Rain Drip, Viscosity); Oil & Soap is Oil Tension, Oil
Bodies, Soap Bursts, Clear Film and Polarity; Ferrofluid is the phase, the six magnet controls,
Labyrinth and Maze Detail; Reactions is pH Indicator, BZ Reaction, Liesegang Rings, and Lamp &
Light's Chemistry, its two pattern controls and the Turing print's three. Motion: Tilt & Rock is
Gravity, Tilt Direction, Slosh and Plate Rock (from Light Show Look). Swirl, Dye Weight and Heat
Spread went to Fluid Physics; Layer Depth and Spectral Mix to Lamp & Light, beside Light Through Dye.
The ids `squish`, `physics` and `lamp` stay and no control's key changed, so saved layouts, pins,
MIDI maps and deep links open as before; the four new ids are in `SETTINGS_SECTIONS`. `panel` now
asks of seven sections that the sliders the markup draws are exactly the ones the registry files
under it, and that the lamp keeps the optics and Reactions the Turing pattern. A saved layout's
Fluid Physics panel now shows only the flow (about a third of the knobs it did).


### 35c-2. One home per setting, second half (shipped 2026-10-25)

The owner's audit named controls that appear twice, and strengths that come twice for one input.
Checked one by one: the ones that really were two places are now one.

- Flash Limit was a switch in Master and another at the foot of Wall → Output. The switch is in
  Master, where a hand riding a set is; Wall → Output draws a line that says on or off and where the
  switch is, because the wall is where someone checks the safety. The test id `output-flash-guard`
  is gone (no check read it); `flash-limit-master` stays.
- Room, Film and Sound each had a Drive (the sensor stirring the liquid) in its section and an
  Impact (the master over the patches that read it) in Patches. Each Impact sits under its Drive now;
  Shapes Impact has no input section and stays at the bay, which links to the other three. The keys
  are unchanged; only the section a pin is filed under moved (`deskPins` SECTION_OF). This undid the
  earlier gathering of the masters under the bay, on purpose: the owner's later finding was two
  strengths for one input.
- The platform's spin (Rotation Speed, the Flick buttons, Auto Spin, Spin Rate, Beats a Turn,
  Reverse Spin, Spin Direction, Wander, Spin From Music, Flick Strength, Plate Drag) left Plates & LED,
  a Stage section Build and Gig cannot dock, for **Plate Spin** in Motion. No key changed.
- Build's deck takes Squish Plate after Fluid Physics, since the glass's knobs the deck once held
  under Fluid Physics are in Squish Plate now. A layout already saved is untouched.
- Songs' "Stage sequences (the old sequencer)…" 10 px link at 40% opacity is a button of the same
  weight as its neighbours.
- The track panel had its own Start a take and replay/delete list beside the Record panel's. It is
  one button into the Record panel; the take itself, its clock and `T` are unchanged.

Checks. `panel` files each master with its source and each Drive with its master, and asks the
sliders-drawn-equal-sliders-filed rule of Plate Spin, the room, the film and the sound as well.
`qa` reads Film Impact from the film's section.

### 35c-3. One home for MIDI on and the audio source (shipped 2026-10-25)

Two switches that were each drawn twice, in surfaces whose checks read the control.

- **MIDI on.** Settings' Controller section and the MIDI sheet both drew the switch, the port,
  the factory maps and Auto-map. The section is the home, since it is where a controller is
  plugged in and set up (and where the dot's neighbour, the "Set up the APC40" button, already
  was). It gained the **LEDs** out-port (`settings-midi-output`), which only the sheet drew. The
  sheet is for teaching: Learn, banks, bindings, the picture, the file. It draws a state line
  (`midi-state`, `data-on`) and a **Set up…** button (`midi-setup-open`) that opens the section.
  The activity dot and the last message stay in the sheet, where a hand is touching things.
- **Audio source.** Settings' Sound (five options) and the Sound sheet (six, with the plate as an
  instrument) both chose it. The sheet is the superset and the home; Settings' Sound row is a state
  line (`audio-source-state`, `data-source`) and **Change in Sound…** (`audio-source-open`), which
  closes Settings and opens the sheet. The device picker stays in Settings, where the Mic dot lands.
- The phone had one of each already: its Sound sheet chooses the source, and iOS has no Web MIDI.
  Nothing there changed.

Checks. `panel` reads the section for the switch, both ports and the factory maps, and the sheet for
the absence of its old copies; `qa`'s Mic-dot block reads the state line and follows the link to the
sheet's Mic tile; `opensource` and `kickbubbles` choose the band in the sheet and read the state
line. Harnesses that set `chromaglass-audio-source` in storage are unchanged.

### 35d. Colour and keys (shipped 2026-10-25)

The owner, drawn to teenage engineering's hardware, chose all three of twelve playful twists in order; this
is the first batch, the three that need no new behaviour. Colour says where a control lives, never whether
it is on: violet is on and red is live exactly as 35a set them (`npm run states` holds), so the seven group
colours are muted mid-tones kept off both, each holding its knob's pointer at 3.9:1 or better. A setting's
group is the group of the section that draws it, so Speed is the same colour in the Rides panel as in
Settings. The colour reaches the cap through one custom property, `--cap`, set by `data-group` and read by
whatever is inside, which is how the panel header's tick and the phone's thumb take it without a prop. The
tools' pictograms are single lines on a 24 grid, one for what each tool does to the liquid; the desk's are
keycaps with the letter in the corner, the held one pressed 2 px and lit, the phone's the same pictures in
the dock. Snail and hare sit at the ends of the five pace controls and come up from faint when the control
is at that end; they do not move. Judging §77.

### 35e. Liquid in the controls (shipped 2026-10-25)

Batch B of the owner's playful-controls choice: three controls that behave like the material they set, each
drawn inside its own few pixels and holding still under reduced motion. The bottle in hand leans forward on
the desk's Bottles panel and the phone's Dye sheet and dock, and stands filled to what is left of the Dye
Budget: the plate's mean dye density against the target the regulator holds it to, eased toward the
closeup's own, read a few times a second by the one bottle that is picked (a polled getter, not App state,
so nothing above it re-renders). The surface stays level as the bottle leans, as a real one's does, the
liquid being drawn in the room's frame and clipped by the bottle's. The Viscosity buttons each let a drop go
when hovered, focused or chosen; a drop released in a viscous carrier falls at Stokes's terminal speed,
which is the inverse of the viscosity, so the fall takes twenty times as long for thick as for thin (the
solver's own 20 mm²/s and 1), slowed at one factor for both. Lamp Warmth's bulb names the colour temperature
the grade matches: the blackbody, from Planck's law and a fit of the CIE matching functions, whose red over
blue is the grade's at that position, and glows that blackbody's own colour. The reading is of what the
shader does, and says what the slider never did: it tops out at 5100 K. `npm run panel` holds the kelvin to
the shader's tint, the drop's pace to the solver's viscosities, the bottle's level to its formula and the
wiring, and the reduced-motion rule. Judging §78.

**35e-2, the lamp widened to the halogen (2026-10-25).** The grade read in kelvin topped out at 5100 K, a warm
morning and not the 3200 K of an overhead projector's quartz-halogen lamp. Lamp Warmth is now the lamp's
temperature, stepped evenly in mireds (a million over the kelvin, the unit colour is graded in) from 6500 K to
3200 K, and the plate multiplies the picture by the blackbody's colour there: its red, green and blue against the
neutral's from Planck's law and the Wyman fit of the CIE functions, held to red plus the small red lift the old
grade had, worked out once on the CPU and passed in as `lampTintR/G/B` rather than the fixed `vec3f(1.06, 0.9,
0.7)` mixed in by the slider. The travel is 0 to 3.75, so that the number saved looks hold keeps its meaning:
0 to 1 is still 6500 K to 5100 K, and the new tint is the old grade to 1.45% a channel there, which is why no preset
or saved look moved (the shipped ones that use it: Velvet Underground 0.25, Home Movie 0.45). Measured on the lab's
seeded plate, mean 0 to 255 per channel, old then new: 0.25 (64.4, 44.1, 55.9) then (64.5, 44.3, 55.3); 0.45
(65.5, 43.1, 51.2) then (65.5, 43.3, 50.3); 1 (67.6, 39.6, 37.5) then (67.5, 39.9, 37.4); the halogen end 3.75 is
(68.8, 25.4, 6.0), against 6500 K's (63.5, 45.8, 61.4), a blue dye going nearly black as it does under a real
tungsten lamp. The vignette is unchanged, blended as it was (a first version multiplied by a second blend and was 4 to 6% dark in the corners, which the review caught), and full from 1 on. `npm run panel` holds the shader to the uniforms, the
kelvin to even mireds ending at 3200 K, the tint to the blackbody's ratios, and 0 to 1 to the old grade.

### 35e-4. Home Movie at 3560 K, the warm end as bright as the white (shipped 2026-10-27)

The owner left both open choices to the session. Home Movie went from Lamp Warmth 0.45 to 3 (3560 K): a Super 8
projector's lamp is a 3200 to 3400 K halogen, and the end of the slider (3.75) is not used because the tint is the
full blackbody ratio, which a camera records and a room-adapted eye sees less of. Brightness: colour temperature does
not set a lamp's output. A lamp run cool on a dimmer does lose light (flux goes as the lamp voltage to the 3.4, its
temperature as the voltage to the 0.42, so about the eighth power of temperature near 3000 K), but that is Exposure,
not the colour. `lampTint` now scales the tint above 1 to keep the luminance it has at 1 (0.924), where it had fallen
to 0.811 at 2, 0.718 at 3 and 0.660 at 3.75. Red rises to 1.36 at 3 and 1.48 at 3.75, so a full-red pigment clips:
named, and the six-band lamp spectrum (35e-3) is its proper fix. 0 to 1 is untouched. `npm run panel` holds the
luminance to 1e-9 from 1 to 3.75.

### 35f. Show hardware (shipped 2026-10-25)

Batch C of the owner's playful-controls choice, items 7 to 11 (the slide carousel, 12, is its own piece): five
controls drawn as the machines they stand in for, each moving only inside its own few pixels and holding
still under reduced motion. Record is two tape reels. Tape runs past the heads at one speed, so a reel's
turn rate is that speed over the radius of tape on it: the supply reel starts full and slow and speeds up as it
empties onto the take-up, which starts a bare hub and slows as it fills (a compact cassette's 4.76 cm/s, hub
0.9 cm, pack 2.1 cm, a constant-thickness roll so the pack's area, not its radius, is the tape wound on). The
angle a reel has turned through is the integral of v / r, which has a closed form for a radius that is a
square root of time, so the button is stateless: the angle is a function of the clock and a one-second linear
transition carries it round. `npm run panel` integrates the turn rate numerically and holds the closed form
to a tenth of a percent, across the end of the tape too. The phone's Play pill takes the reels in a fixed box
(the pill still does not widen when a clip starts, and is red while it runs, which the audit said it was not),
the More sheet's tile takes them at 20 px. Tap Tempo is a pad with a light that blinks on the beat the source
has locked, four pips that fill with the taps, and the tempo in segment digits. The light is a Web Animations
loop at the source's period and phase, resynced every quarter second if it slipped 30 ms, so a beat renders
nothing. The VU needle is a moving coil: a second-order system with a damping ratio of 0.81 (1.3% overshoot,
inside the standard's 1 to 1.5) and a natural frequency set so its step response first reaches 99% at
300 ms, solved exactly over each step because an Euler step added damping of its own that took the overshoot
to 0.8% and the rise to 208 ms. It reads the plate's volume on its own frame through a ref (nothing
re-renders with it), falls to its stop when the sound stops, writes "deaf" on the dial when the input
is, and under reduced motion shows the number. Blackout is a lens with a cap: the same drawing on the desk
header, Settings, the remote and Draw, the cap snapping on once in 140 ms and in the button's own colours
(red where the button is live, neutral otherwise: Draw's was red while the room was lit); the remote's two
Blackouts are one, the bar under the thumb. Auto Spin has a platter's strobe ring: in Rate the dots drift at
the dish's speed, in Tempo with a tempo heard the dish turns exactly one dot a beat, so lit by the beat the
ring stands still, up to 32 beats a turn and as a slow alias past that. Judging §81.

### 35g. Looks as slides in a tray (shipped 2026-10-25)

Item 12 and the last of the owner's playful-controls choice. A look is a 35 mm slide and the stage takes it
from a round tray. The slide is drawn at a real mount's proportions (`slideTray.ts`): 50 mm square, one corner
clipped so it can be told right way up in the dark, and a 34 by 22.5 mm aperture, the 3:2 a 24 by 36 mm
frame shows through, with the look's own two palette colours (`swatchOf`, from its contract) on the film. The
mount is one cardboard colour on every look and takes no state colour: lit stays the row's violet ring and
live its red, so the picture says only "a slide". It replaces the flat swatch on the set list rows (`CueRow`),
the cue bar (the look on stage, and the cued one behind the arrow), every row of the preset menu (new: it had
none), the performer's saved list, the phone's look button and Looks sheet, and the Play screen's Looks strip.
The strip is now a tray you flick: a mount a tile, snapping one slide at a time (`snap-mandatory`,
`snap-always`), the lit ring on a wrapper because the clipped corner would cut a ring drawn on the mount.
The round tray (`SlideTray`) is the drum from above with a fixed gate at the top. It clicks one slot when the
look on stage changes, the way the changer pushes one slide back and lifts the next whatever the distance in
the list: forward when the new look stands later in the list, back when earlier, nothing for the first look of
a session or no change (`stepOf`). It holds only its count of pushes, turns in 160 ms with a small overshoot
and settle, and has no loop and no timer. It is on the cue bar and beside the phone's look name and the Looks
heading. Under reduced motion it does not turn. Held by `npm run panel` ("Looks as slides in a tray"). Judging
§82.
