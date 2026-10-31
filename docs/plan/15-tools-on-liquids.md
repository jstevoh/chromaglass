# 15. Every tool on every liquid

This section is in 2 files, cut between items: `15-tools-on-liquids.md`, `15-tools-on-liquids-2.md`.

Asked 2026-09-27 ("Shouldn't blowing and finger also move around the ferrofluid?",
then "look at the liquid and tools interactions across all of them"). Read from the
code, with the velocity numbers measured in the lab. The whole table is in
`docs/tool-by-liquid.md`. What it found, by what a
performer would notice first:

## 15a. Only the Dropper lays the bottle's liquid (shipped)

**Shipped** (#201): every laying tool lays the bottle's liquid (`npm run bottles`); the Splat line's "following the hand" was fixed in #214. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

## 15i. Picking a bottle pours nothing (shipped)

**Shipped** (2026-10-04): picking a bottle sets the bottle in the hand and pours nothing (`npm run bottles`). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

  Maze, Ferro Paint) carry their own amount and lay their own pour when they load.

## 15j. Found with 15i

- A cast display that cannot mirror the show's canvas runs a plate of its own and is
  sent the settings, never the hands. So nothing poured by hand reaches it, and when a
  hand's first Ferrofluid pour turns the amount up there, it lays the look's ring over a
  plate the hand never touched. Sending the hands' gestures to it (as the remote's are
  applied with `applyGesture`) would close both.
- Ferrofluid poured by hand and a look change: a cut leaves it in the solver, hidden by
  the new look's Ferrofluid at 0 (the next pour clears it); a look that fades in clears
  it at the half-way point when the incoming look asks for none. One rule for both, and
  whether hand-poured ferrofluid should stay visible through a look change, is the
  owner's call.
- A Back fades to the previous settings as they were, so after a hand's pour turned
  Ferrofluid up they carry its 0.6, and the Back lays the previous look's ring half way.
  The previous look's own amount would need keeping beside its settings.
- A new solver after a hand's pour lays nothing now, so the pour (and, on a look with
  ferrofluid of its own, the look's) is gone from the new grid until 9w carries the phase
  across (#266).

## 15b. A tool's push lasts one step (why Blow and Finger barely move anything)

**Partly shipped** (2026-10-04): the Finger is a solid in the thin layer and moves every liquid (`npm run fingerflow`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**Shipped for the Finger on a thin gap (every look; `npm run fingerflow`), not yet
judged on the Mac (`docs/judging.md` §33).** The owner's OK for the feel change came
2026-10-04 ("start with the making liquids real work").

Left, each its own plan item:

- **15b-blow.** Blow's push on a thin gap is still a disc of velocity (moved nothing
  measurable for the Finger's; Blow keeps its carries, `blowDye`, `blowOil`,
  `blowCarry`). Its real replacement is air's shear and the jet's dimple on the film,
  15g, which can now be built on this.
- **15b-old.** With Thin Gap off (and on the CPU engine) the old plate keeps the clamp
  and the Finger keeps its push and its carries. Not worth a lasting-current route
  while every look is thin; if a look is turned back off for its cost (judging 2.1),
  revisit.
- **15b-inside.** The penalised solid is a porous disc: the liquid (and its colour)
  under the hand rides with it, where a real fingertip has no liquid inside it and
  parts what is ahead of it. A pool the hand passes over is drawn along under it, and
  at its tail the colour bleeds out through the disc's soft edge (two Brinkman lengths,
  `handEdge`) as a trail. Measure against a stylus through marbling (Jaffer's tine
  displacement, falling with distance from the path) and, if it shows, exclude the
  hand's cells from what the carries move.
- **15b-remote.** A hand's Finger moves at the rate its events come, not once a step:
  the solid it lays moves as far as the hand moved since its last event, in the one
  step after it, and is not laid on the steps between. A remote (the phone as the
  laptop's remote, a pen, OSC) sends at message rate, and the pointer itself is no
  smoother when its events come slower than the steps (tools.mjs's stroke is a cell
  every third step), so such a stroke is a hand that stops and starts. It no longer
  loses colour (fingerflow's check 7 draws it that way); whether it reads as a jerky
  stroke on the Mac is judging §33's, and if it does, carry the hand's last speed
  across the steps until its next event.

## 15c. Blow's wind erases colour rather than pushing it (shipped)

**Shipped** (#215): Blow's wind carries the colour and the oil the way the hand went, rather than erasing them (`npm run wind`, `npm run tools`). Its follow-ups are 15f and 15g. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Shipped so far* (#254): the wind is drawn both ways from the plate's middle and each stroke beats the window before it; the drift after turns round with the wind. Story in `docs/plan-shipped.md` §15c (moved 2026-10-29, 19m-2). Not yet seen: the line failing on a wind with its carry turned off.

## 15g. Blow as air on a thin film, not a carry (replaces 15c's shortcut)

*Shipped so far* (first part): on a thin gap the moving Blow is the breath's shear on the surface, ½ρ_air C_f U², a body force for as long as the breath goes on (`src/lib/breath.ts`; `npm run airblow`), and its push and its three carries no longer run there. Story in `docs/plan-shipped.md` §15g (moved 2026-10-29, 19m-2). Not yet judged on the Mac (judging §44). Open, each its own PR:

- **15g-2 The jet's dimple.** A held puff (a Blow held still that is not the straw:
  a second finger, a plate that is not the lead, a remote's puff) still runs the old
  push and the Press's ring carry. Its physics is the jet's stagnation pressure, about
  ½ρ_air U² ≈ 20 Pa at 6 m/s, which against the liquid's weight is a dimple of
  Δh = p/ρg ≈ 2 mm in a 6 mm layer: it belongs in the gap field the Press squeezes, a
  press at that pressure. Its outward shear is all divergence, which a rigid film moves
  nothing by, so it waits on this. The moving wind's own dimple, travelling with it,
  comes with it.
- **15g-3 The film's free surface.** The solve holds the film's height as the gap (a
  rigid lid), so liquid the breath pushes ahead piles into no bow wave and the film
  does not thin where the air hits. Real for a covered plate, not for an open dish.
  Needs the gap to move with the flow, dh/dt + div(h u) = 0, with gravity and surface
  tension pulling it flat; shared with 18c (a pour that adds liquid).
- **15g-4 Thin Gap off.** The old plate keeps the push and the carries (as 15b-old
  keeps the Finger's); it goes when the old plate does.
- **15g-5 A remote's wind.** A remote hand's directed Blow (performGesture: the phone as
  the laptop's remote, a pen, OSC, a replayed take) still runs the push and the carries:
  its strokes arrive a message at a time, and a breath laid only on those steps would push
  the liquid for one step in every few (the drag time is about eight steps), a fraction
  of the mouse's. Hold the breath between messages as the pointer's direction is held
  (BLOW_DIR_HOLD_MS), then let it blow as air (15b-remote is the same for the Finger).
- **15g-6 The breath's numbers.** 8 m/s at the surface and C_f 0.01 are a firm breath
  from a few centimetres, set so the air moves a pool about as far as the carries did on
  the Mac (at 6 m/s `npm run tools` read a third of it), not a measurement. A phone
  recording of a real breath across a dish of oil (`npm run watch`) would set the speed
  the colour goes at, against the lab's 2.72% of the plate over a 1.5 s stroke.
- ~~**15g-7 Blow's stroke to the right moves less than to the left in the app.**~~
  **Shipped** (#623): the pointer handler pressed the glass under the pointer (a bowl 24
  cells across) and stirred along the move on every pointer event with the button down, for
  every tool but the Magnet, the Spin, the Drop and the Finger, and the Blow was never taken
  out of it. The pointer leads the pool it blows across, so each press sent the pool's liquid
  back against the breath, and the gap it closed crept open for seconds after; thirty presses
  a stroke whatever the pace against the breath's steps, which came with the runner's. Story
  in `docs/plan-shipped.md` §15g-7; `npm run tools` now counts the glass the hand presses in a
  Blow stroke and asks for none; the touch path shares the fix, and a bubble's squeeze on its
  footprint is counted as the bubble's, not the hand's.
- ~~**15g-8 The stroke's straw on GitHub's runners.**~~ **Shipped** (this PR): the straw's
  bubbles took the dye under them by a multiply on the GPU and the CPU put it back from a
  readback mirror frames behind, so "keeps it" swung ±15–20% wherever the straw blew. The air now
  carries the liquid under it out to the rim on the GPU in flux form (airDisplace), conserving
  at any frame rate, and the check's Blow stroke is paced by the plate so no runner blows the
  straw mid-stroke. Story in `docs/plan-shipped.md` §15g-8.
  - **15g-8b A whole-placed bubble piles its liquid in a ring a cell or two wide.** The push
    stops at the first cell with no air, so a bubble that appears whole (a kick's, a look's
    seeded ones) leaves its displaced dye in a narrow, bright ring, where a real thin layer is
    incompressible and shifts the liquid round it outward instead (no ring on an even plate). A
    growing bubble is the flow's: the air arriving is a source in the projection. The real fix
    is the dye's carry in flux form where the air arrives, so the source's flow moves the dye
    without the semi-Lagrangian copy it leaves behind (the reason the push exists at all).
- **15g-9 The press and stir on every pointer event, for the tools that still take them.** The
  Spray, the Splatter, the Pour and the Streak (and the Press, over its own squish) still press a
  24-cell bowl and shove the liquid five times the move on each pointer event
  (`src/sim/tools.ts` stirAlongMove), thirty a stroke whatever the pace. Whether each wants it
  is its own question, measured as the Blow's was: the lab at the app's step with and without
  it, and `npm run tools`' pressed-cell count per stroke.
- **15g-10 The drop's splash presses as the hand.** `applySquish` with the `splash` stroke
  (`src/sim/fluidSimulation.ts`, the drop's landing) takes the default presser, the hand, so a
  drop falling during a Blow stroke would count in `npm run tools`' "presses no glass along
  the way" as the hand's (none falls there: the section runs with Rain Drip 0, so it can only
  ever be a false red, never a miss; found in #623's review). Give the splash its own presser
  (`Presser` in `src/lib/squish.ts`) when `fluidSimulation.ts` has the bytes: it sits at its
  size ceiling.

*The item as first written* (what air on a thin layer does: shear, pressure, the film, and why the carries were a shortcut) is in `docs/plan-shipped.md` §15g (moved 2026-10-29, 19m-2); its pressure and film halves are 15g-2 and 15g-3.

## 15f. Found with 15c

- The Finger carries the oil (`carryMix`) whenever the dye mirror is current, and
  a carry with no colour under it never marks the mirror spent. So a Finger over a
  body with no colour under it carries the oil every step at a share sized for one
  carry a reading. The Press (15d) and now the Blow keep the oil on its own clock
  (`oilPressAfter`); the Finger should too.
- The Press's ring (`pressDye`) keeps 99.4% of a pool of colour a puff blows out over
  30 readings, not all of it: a nearest-cell gather does not tile a small ring
  exactly, and the counted stretch that makes a flat plate exact does not on an
  uneven one. Small next to the 21% the eraser lost, but a ring that splits each
  palm cell exactly among the cells that read it would keep all of it.
- A remote hand's Blow (performGesture: the phone as the laptop's remote, a pen, OSC,
  a replayed take) goes through the same `blowWind`, but no check drives it through
  the app: `npm run wind` runs the functions it calls, and `npm run tools` only the
  mouse. A gesture sent through the remote's link in `tools` would close it.

## 15d. Press moves the colour out of an oil body but leaves the oil, and leaves the ferrofluid

**Partly shipped** (#210): a press carries the oil with its colour, and a pressed ferrofluid pool keeps its volume under Thin Gap (`npm run pressoil`, `npm run ferropress`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Shipped so far* (#210): the press carries the oil to the dye's ring by one straight-out map (`src/lib/pressRing.ts`; `npm run pressoil` 11/11), and the gap's drag takes the ferrofluid's own viscosity (`FERRO_NU`; `npm run ferropress`). Story in `docs/plan-shipped.md` §15d (moved 2026-10-29, 19m-2). Still owed: the straight-out dye and the ferrofluid's faster answer judged on the Mac (judging §18, §23), and `npm run press`, the only app check of the dye ring's shape, is not in CI: worth bringing into the tools shard.

*Open, found building it:*
- **With Thin Gap off a press still greys the ferrofluid.** The old solver's flow cannot
  carry a press (15b), and dividing by the gap there piled twelve times a pool's volume
  under the palm (lab). The press moves to Thin Gap ("Press draws liquid back on lift",
  18a-3), which is on in every look since #248, so only a look turned back to the old
  plate shows this now.
- **The glass flattens the spikes.** A Rosensweig spike stands from a free surface; under
  a palm pressed to a sixth of the gap there is no room for one, and the field there
  makes a flat labyrinth instead. The spikes (`spikes.ts`, `phaseMu`'s wells) do not
  know the gap. For the standing domes (9t), whose thickness field is where a cap by the
  gap belongs.
- **The labyrinth's scale follows the gap.** In a Hele-Shaw cell the labyrinth's period
  goes as the gap times an exponential in the inverse magnetic Bond number (2M²h/σ,
  Langer, Goldstein and Jackson 1992), so a press (a sixth of the gap) should melt the
  maze under the palm into a round pool and the lift should bring it back. The maze's
  period is `MAZE_PERIOD` wherever the glass is.
- **The lift's fingers do not show.** In water (the ferrofluid five times thicker) the
  lift is the unstable direction, but the Cahn–Hilliard rounding takes a bumpy edge
  back faster than the lift grows it (`ferropress` prints 0.024 for both). The
  interface's tension lives in the separation, not in the flow's pressure, so the
  fingers' scale is not Saffman–Taylor's own (π·b/√Ca); a capillary pressure jump in
  the thin solve would make it so.
- **The separation conserves area, not volume.** `phaseCH`, `phaseRelax` and
  `phaseSeparate` move the share between cells of different gaps as if they were equal:
  a full pool's edge sitting across a palm's rim gained 1.6% volume in forty steps held
  (lab, with the first cut's excess). Small with the solve's own flux; worth a c·h form
  once the glass moves the ferrofluid often.

*Found 2026-09-27, not done:* **a press can still make dye.** The dye's half of
`squeezeOut` takes a share of the disc as a GPU multiply and puts into the ring the
share the CPU mirror read, a frame or more earlier. The squeeze film is pushing the
dye out meanwhile, so the ring can get more than the disc gave (#158: 90 → 285
against −12 on one deploy). #158 subtracted the mirror's amounts instead; that is not
adopted: bilinearly spread over the finer grid it clamps at zero along every thread
finer than a mirror cell, so it makes dye a new way and erases threads the multiply
kept 40% of, a change of look. The fix that makes both halves see the same dye is to
do the dye's move on the GPU too, as the oil's now is (the map is the same one). #158's other two pieces are
in: `depth` sets its curve through the app's setter, and `tools` prints the whole
plate across the Blow.

## 15e. The liquids' own forces on the GPU plate

**The check shipped** (`npm run liquidsgpu`, the Mac plate shard, about a minute on Metal; 4 min 26 s on SwiftShader, 2026-10-27). The GPU has
carried the liquids in fields of its own since the liquids were ported (every pour goes to
`WebGPUFluid.addLiquidDrop` through onDeposit, `liquidPhase` stands aside as `gpuNative`,
and `liquidForces` in `wgsl/fluid.ts` pushes the flow with liquidPhase.ts's constants), and
nothing measured it: `npm run liquids` holds only the 96² stand-in. The check lays the
stand-in's four scenes (now one copy, `scripts/liquidStandIn.mjs`, shared by both checks)
on the lab's GPU solver on the thin gap the looks use, and holds each liquid to the
stand-in's bar and to its size within a factor of two, with the deltas folded every step
and on a still plate. SwiftShader, 2026-10-27 (effect = one less the share left):

| Liquid | Stand-in | GPU, a fold every step | GPU, a still plate |
|---|---|---|---|
| Soap, dye left at its spot at 0.5 s / 2 s | 44% / 54% | 89% / 72% | 99.6% / 99.6% |
| Glycerine, speed against colour alone | 0.023 | 0.047 | 0.047 |
| Milk, spread against bare dye | 0.996 | 0.988 | 1.000 |
| Silicone, dye left in the middle | 0.8% | 61% | 99.3% |
| Glycerine on the old plate (no thin gap) | 0.023 | 0.999 | — |

Neither plate's soap moves the dye it clears: the spot loses exactly what the whole plate
loses (GPU, soap 149 to 107 at the spot and 507 to 465 on the plate; stand-in, 150 to 66
and 507 to 423), so both clear by erasing (15e-5), and the table's soap and silicone rows
compare two erasures. 21 lines gate; 16 are owed to the items below, print, and fail the
run the day they pass (an owed line that reads no number fails too), so the fix that makes
one pass also makes it gate. Briefs 11 (15e-1 and 15e-2) and 12 (15e-5) in the shared
briefs.

- **15e-1. The liquids' forces act only on a frame something else is laid in.**
  `liquidForces` (and soap's thinning, in `deltaDye`) run inside `foldDeltas`, which runs
  only in `applyDeltas` and `applySplats`, and the app calls those only on a frame that is
  `dirty` (LiquidVisualizer's step: a hand, a drop, a pour). On a still dish a spot of
  soap pushes for the one step its own pour folds, then never again: the soap scene
  leaves 99.6% of the dye at its spot where a fold every step leaves 72%. Glycerine is
  the exception, as its thickness on a thin gap is the species' viscosity in the thin
  solve, every step. Move the liquids' forces into the step, once a step, whether or not
  the CPU sent anything. *Measure:* `npm run liquidsgpu`'s "a still plate" lines.
- **15e-2. Where they act, the liquids' passes are about a fifth of the stand-in's.** The GPU
  scales each force by the solver's `dt` (0.004 in the lab; 0.0036 for the app at the
  default Speed), where liquidPhase.ts and the app's CPU before the port scaled them by
  the frame's real seconds (`simStepS`, 1/60). Soap's multiply is scaled the same way and
  is what the soap rows measure (15e-5); milk's repel, weight and polarity are the forces
  it leaves. Folded with 1/60 in place of 0.004 (a copy of the
  check with only the fold's dt changed) the same soap leaves 50% at 2 s (the stand-in
  54%) and silicone 17% in its middle, and both owed lines pass, soap's half second by a
  hair (effect 0.288, the factor of two asks over 0.280). Which time
  base is right is part of the fix: the constants are "per second" (MARANGONI is a
  velocity per unit of tension gradient per second), so a step that stands for 1/60 s of
  the show should push by 1/60 of them, and Speed should not make soap weaker. *Measure:*
  the "every step: as strong as the stand-in" lines, within a factor of two.
- **15e-3. On the old plate (no thin gap) glycerine's body does nothing.** The body's
  drag takes `body · 2.6 · dt` of the velocity a fold, 1% at the lab's dt, and the old
  plate's velocity is made again each step (15b), so the pool falls at 0.999 of colour
  alone where the stand-in's crawls at 0.023. Every look is Thin Gap, so this is the
  plate with Thin Gap switched off; the real fix is the species' viscosity on that plate
  too, or saying in the Thin Gap control that the old plate has no thick liquids.
- **15e-4. Milk's held edge is under 2% on either plate.** `repel` damps the flow leaving
  the pool (a named stand-in, 18d), and on the stand-in it leaves the pool 0.4% tighter
  than bare dye, on the GPU 1.2%: both pass the bar and neither is an edge anyone could
  see, so the GPU's "as strong as" line (three times the stand-in) cannot be judged until
  milk holds its edge by a real interfacial tension (18d's Cahn–Hilliard phase per
  immiscible bottle). Milk is miscible with water, so the honest look may be that it
  does not hold an edge at all; the owner's eyes on real milk in water decide.
- **15e-5. Soap and silicone erase the dye they should push (both plates).** What clears
  soap's spot is the multiply on the dye under it (the CPU's `mul`; the GPU's `deltaDye`,
  `soap² · 0.22 · dt · 60` a fold), "the film it broke thinning": of the dye that leaves
  the spot none is still on the plate, on either plate. The push is there and does
  nothing: liquidForces adds −MARANGONI·∇soap to the depth-mean velocity, a pure gradient,
  which the plate's projection takes away whole. With liquidForces made a no-op every soap
  and silicone reading stays as it was (89.0%, 71.6%, 61.3%); with the multiply made 1 the
  spot keeps all its dye, and so it does with the multiply off and the fold at 1/60 s
  (99.8%, 98.7%). The plate already knows this: `marangoniFlux`'s comment (wgsl/fluid.ts)
  records the same gradient deleted whole for the mix's soap, which since moves what rides
  the surface away from the soap in flux form (u = −k∇Γ, nothing made or lost), every
  step by the step's seconds. But a bottle's soap reaches the mix only when Surfactant Flow
  is over 0.001 (onDeposit), 0 in the defaults. So: a soap or silicone bottle's soap goes
  into the mix and moves the surface by marangoniFlux; liquidForces' soap term and the
  dye's multiply are deleted; and the GPU's liquid fields, which never fade (liquidPhase.ts
  fades soap over 6 s), stop erasing for as long as soap sits. Left for the owner: what
  Surfactant Flow means once every poured soap moves the surface (today it is the pull's
  strength, and at 0 a bottle of soap would move nothing). *Measure:* liquidsgpu's
  "moves the dye rather than erasing it" lines, over half of what left still on the plate.
  This is 18d's "soap into the surfactant field" for the GPU's liquid fields; the σ(Γ)
  law itself stays 18d's.
- **15e-6. A remote Finger is half as strong as the mouse's.** `performGesture`'s finger
  drags with `0.09 · amt · 0.5`, the mouse's with `min(0.25, 0.09 · k)` (k and kTool are
  the same Tool Amount squared): a touch of the default 0.5 is `amt` = kTool, so the
  remote's finger is half the mouse's, and only a pen pressed all the way (1, `amt` = 2
  kTool) matches it, though a pad's 0.5 is meant to be the mouse (performGesture's own
  comment). Measure both through the same
  plate (a `tools`-style line: the same stroke from the mouse and from a remote message
  moves the same colour to a stated share), then drop the extra half.
- **15e-7. A remote Blow never makes a straw bubble.** The mouse's held-still Blow is the
  straw (`strawFlow`, a real bubble blown into the dye); a remote's Blow with no direction
  is the puff, and its only bubbles are the wind's torn-in air (`airTaken`). A held remote
  Blow (a pad, the gamepad, OSC) should be the straw after the same hold, as the mouse's is.
  *Measure:* the remote's held Blow grows a straw bubble as the mouse's does (`straw`).
- **15e-8. Weight and polarity are not yet measured on the GPU.** liquids.mjs holds the
  stand-in to oil riding up a tilt while syrup settles, nothing moving on a level plate,
  oil and syrup parting where they meet and a finger mixing them; liquidsgpu has only the
  four liquids' scenes. Lay those four on the GPU the same way, with the same owed rule,
  before or with Brief 11, which changes the forces they would measure.
- **15e-9. Two lab checks at once share one bundle.** `scripts/lab.mjs` writes the plain
  lab's page to one file in `node_modules/.cache` for every run, so two lab checks started
  together (`npm run quick` runs them side by side) can load a bundle the other is writing.
  Name the file per run (the process id), or build once before the runs start.

## 15h. The Comb: marbling's rake, as a tool (proposed 2026-09-28)

Marbling is one of this plan's three reference columns (5.6 % of pixels on a hard edge
and a contrast of 6.5, against our 2.4 % and 0.8), and its structure comes from a rake
drawn through the colour: the nonpareil, the chevron, the bouquet. There are nine tools
and no comb (`DESK_TOOLS`, `desk/tools.ts`). 15b found that only a hand-written,
conserving carry actually moves liquid under a tool, and 9n (#206) and 15d (#210) have
built that carry for the ferrofluid and the oil. A Comb is N parallel carries a stroke,
on the dye, the oil bodies and the ferrofluid alike, with the tine count and spacing on
Tool Amount; a second pass at right angles makes the chevron. On the phone each finger
is a rake, and OSC gets `/comb`. *Measure:* a lab check in the manner of
`npm run ferrohands` (N parallel bands moved a stroke, mass exact), and
`npm run detail`'s hard-edge share after a two-way comb against the Marbling column.
