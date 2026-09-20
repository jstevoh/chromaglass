# Plan: a plate with real detail, and a show you can render

Two threads of work, merged into one running order.

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
> plans behind each piece. Note the **shader freeze**: the GLSL does not change
> until the port cuts over.

## Running order

Each batch is one PR: build, test in the sandbox, merge, deploy, then a GPU look on
the Mac before the next one starts. Order is by what lifts everything else first,
and by what would otherwise force a rebase later.

### 1. Sharp liquid, and pigment in it

`src/lib/gpuFluid.ts`, `src/components/LiquidVisualizer.tsx`, `src/types.ts`

- **Interface sharpening** (`sharpness`, 0–1). A counter-diffusion term along the dye
  gradient, applied each step after advection, that restores the step at a boundary
  instead of letting it smear. This is how multiphase solvers keep two fluids apart.
  Clamped so it can only undo diffusion, never amplify beyond the local range of the
  four cells it samples, which is what stops checkerboarding.
- **Granulation** (`granulation`, `grainScale`). Sub-grid pigment texture: a noise
  field sampled in *advected* coordinates, so the speckle travels with the dye
  instead of sitting on the screen, modulated by dye thickness and by how slowly the
  cell is moving (pigment settles where the flow is slack).

Both land in the GPU and CPU solvers so the two engines still agree. Shipped as two
PRs rather than one, so the first improvement reaches the projector sooner: sharpening
first, granulation second. Both are in.

**Sharpening is retired, on the sixth look.** The test this plan called for has been run
at the grid the show actually falls to. At 256², where a solver cell is nearly three
pixels and the pass should matter most, switching it on and off on one plate moves the
10-90 % edge width by less than the plate's own drift — −1.25 to +1.33 px at 0.5, −0.3 px
at 1.0. Across pages it narrows edges by a pixel in two captures of five and not at the
same frame count in either set, and at 384° the sign flips. What it does add over hundreds
of frames is pale terraces and torn lips, which is the old fault arriving slowly on a
coarse grid. It is off in the defaults and in every preset; the control stays, because on
the CPU solver at 192² it measurably steepens (mean gradient 0.091 → 0.104), and that is
the engine a weak machine runs. Batch 1's other half, granulation, stands: it now works
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
thinning written as a dye multiplier reach both engines through a path that exists.

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
sim grid and added as velocity each frame. One loop, both engines. This is the piece
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

## Not doing

- **Kaleidoscope, tiling, tunnel, halftone, posterize, solarize.** Warps of a picture.
  They are what every VJ tool already offers and they would erase the plate's identity.
- **A built-in drum machine.** Reacting to a synthesized beat is fine for rehearsal,
  but you perform with a band, and the music file player already covers practice.

## If you want to reorder

Two things decide the order above, and both can be moved.

- **Batches 5 and 6 are the ones that matter most**, and they sit last only because of
  a dependency, not because they are worth less: 6 changes what the app is, 5 changes
  how it feels to play. 5 touches no fluid code and can be pulled forward at any time.
- **The seeded generator is the hinge.** It is a mechanical sweep over 104 call sites
  in files that batches 1–4 also edit. Doing it last means one sweep over code that has
  just changed; doing it first means every later batch is written against the seeded
  generator from the start, which is cleaner but delays the first visible improvement
  and will shift existing bead layouts and finger spokes slightly. It is worth pulling
  forward as its own small PR the moment rendering a song is the next thing wanted.

## Operating rules

- The sandbox runs the CPU solver under SwiftShader, so every look is judged on the
  Mac's GPU before the next batch starts.
- One Mac session at a time, committing from a worktree, never while a show is
  running: two sessions in one checkout have already trodden on each other's server
  and files.
- Every new setting is MIDI-learnable, reachable from the phone, and defaults to the
  current behaviour so a preset made today still looks the same tomorrow.
