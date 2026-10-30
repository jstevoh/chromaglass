# 15. Every tool on every liquid: what shipped

How §15's shipped items were found, built and measured. The open work is in
[`docs/plan/15-tools-on-liquids.md`](../plan/15-tools-on-liquids.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## First pass (moved 2026-10-04)

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

## Second pass (moved 2026-10-04)

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
  Maze, Ferro Paint) carry their own amount and lay their own pour when they load.

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

## Fourth pass (moved 2026-10-29, 19m-2)

### 15. Every tool on every liquid

#### 15c. Blow's wind erases colour rather than pushing it

**Changed after it shipped (2026-10-04): the push was judged against what came after it.**
Main's deploy of 5505a2a (run 37196539858) went red on `tools`' "pushes the colour
along": the wind moved the pool's middle +0.70% of the plate toward B, against
+0.56% to beat, all of it from the window left alone *after* the stroke (+0.39%;
the window before read -0.00%). With the ambient seeder off (#249) the window before
read -0.08% to +0.00% on all five runs that reached the line, and the window after
+0.24% to +0.39%, toward B every time. And since Thin Gap is on in every look
(18a-every) the stroke's own push is smaller (+0.70% to +2.31% on main's code, was +0.76% to +4.15%), so the
drift is a larger share. Whether it is the wind's liquid still going is not settled:
split in halves on #254's first run it read +0.30% then +0.16% (no dying away within
the thin gap's tenth of a second), and charged at the second half's rate the wind's
+0.64% met +0.69%. Charging it or not is a guess either way, and not charging it
would pass a wind that pushed nothing on a plate that starts drifting with the
stroke. So the wind is now drawn both ways, out to the right and out to the left
from a fresh pool in the plate's middle each time, and each has to beat the window
before it by 0.002: a drift the wind did not make helps one stroke as much as it
holds back the other, and from the middle a drift toward the middle moves neither. The windows after are
printed in halves for both; if they turn round with the wind, the drift is the
wind's. On #254's Mac run (37200639755): out to the right +2.33% against +0.20% to
beat, out to the left +1.48%, both with -0.00% before; after it +0.16% then +0.14%
right and +0.26% then +0.15% left, each toward its own stroke's end, so the drift
after does turn round with the wind. Not yet seen: the line failing on a wind with
its carry turned off.

#### 15g. Blow as air on a thin film, not a carry

**First part shipped**: on a thin gap (every look) the moving Blow is the breath's
stress on the surface, ½ρ_air C_f U² (about 0.38 Pa), a body force the solve takes in
for as long as the breath goes on, so the column goes at τh/2μ; its push and its three
carries (`blowDye`, `blowOil`, `blowCarry`) no longer run there (`src/lib/breath.ts`,
hsBody; `npm run airblow`, 5 checks). Not yet judged on the Mac (judging §44). How it
was built and measured is in [`docs/plan-shipped/15-tools-on-liquids.md`](15-tools-on-liquids.md), under the
same number. Open, each its own PR:

#### 15g. Blow as air on a thin film, not a carry (the item as first written)

What follows is the item as it was written, before its first part shipped:

The owner's standing rule (2026-09-28): build from the chemistry and physics of the
liquids, not from a picture of their result. 15c is a shortcut by that rule, and so
are the carries it copied. The wind moves the colour, the oil and the ferrofluid
directly, a take from under the hand and a put a hop ahead (`blowDye`, `blowOil`,
`blowCarry`), because the flow cannot carry them: a tool's push is cut back to idle
at the end of the step it was added in (15b). The Finger (`carryDye`, `carryMix`,
`fingerCarry`) and the Press (`pressDye`, `pressMix`) do the same. It keeps the
colour and moves it the right way, and it is not what air on a liquid does.

What air blown on a thin layer does, and what the plate would need:

- **Shear.** Air moving over the surface drags it with a tangential stress, about
  tau = 1/2 rho_air C_f U^2 along the jet (C_f a few thousandths for a wall jet).
  In a layer this thin the flow is viscous (lubrication), so the stress drives a
  Couette profile: the surface moves at tau h / mu and the depth-mean at
  tau h / (2 mu), in proportion to the depth. A deep pool moves more than a thin
  film under the same breath, and a thick oil (glycerine) less than water. The
  plate's depth-mean velocity should take tau h / (2 mu) as a force that lasts as
  long as the breath does, not a disc of velocity that the clamp removes.
- **Pressure.** Where the jet meets the surface it presses a dimple, about
  1/2 rho_air U^2 at the stagnation point, which pushes liquid out from under the
  nozzle (a Poiseuille flow, -h^2 grad p / (3 mu) depth-mean). That is a held
  puff's ring, and it is the Press's physics at a smaller pressure: it belongs in
  the gap field the Press already squeezes (`squeeze`, `applySquish`), not in a
  ring map.
- **The film.** The layer's thickness moves with its own flow,
  dh/dt + div(h u) = 0: it thins where the air hits and piles up in a bow wave
  where the wind stops. Colour, oil and ferrofluid are then carried by that one
  flow, conserved by the advection, and the carries can go.

Depends on 15b: the tool's force has to reach a flow that remembers it (the lasting
current `cur`, or the clamp lifted for forced flow), which changes how every tool
feels, so it goes to the owner first. When it lands, `npm run wind` is the check:
with the carries deleted, the colour kept and moved along by the flow alone, and the
oil with it, against the same bars. Then the same for the Finger (a solid dragged
through the layer: no-slip on the finger, the wake behind it) and the Press
(squeeze flow from the gap, which the solver half models already).

#### 15d. Press moves the colour out of an oil body but leaves the oil, and leaves the ferrofluid

`squeezeOut` carried the dye into a ring and nothing else. With Oil Bodies on, a
press took the oil's colour out of its body, which is what the Finger did before
`carryMix`. The ferrofluid under a palm doesn't move either.

**The oil: shipped.** A press takes the oil the way it takes the dye, the same share
of every cell under the palm, and puts it down on the dye's ring (the palm's rim to
1.7 palms out), area for area (`pressMix`, the other mode of `mixCarry`); the dye's
half (`pressDye`) now lands each cell's colour by the same map, straight out, where it
used to spread it evenly round the whole ring, which put half of a palm-edge press's
colour in the water across the ring from its oil. Both live in `src/lib/pressRing.ts`,
which the app and the lab share. What would land off the plate is not taken, oil or
colour. The oil is pressed once a dye reading on its own clock, so a clear body is
pressed at the dye's rate. `npm run pressoil` (lab, with the app's own palm, a quarter
of the plate across) 11/11: the oil kept to 0.4% of what moved in the middle, off it
and in a corner; every palm cell at exactly 0.4^6; the ring gaining what the palm lost
band by band; one press of each half on a body's edge landing the same amounts in the
same cells (the old even ring: 454 of 908 on the far side, in the water); each palm
cell giving up the same share of colour as of oil; and in a corner all the colour
taken landing (780.0 of 780.0), none taken from the 2225 palm cells with nowhere to go. A first
cut with the Finger's cone and a hop lost 27% of the oil moved in a corner and landed a
fifth of it back under the palm. `npm run bottles` (Mac) asks that the app's Press,
held and replayed, reaches it, and only with Oil Bodies on. The phone's Press is the
same `squeezeOut`. The straight-out dye is a change of look on every plate: to be
judged on the Mac (`docs/judging.md` §18). The only app check of the dye ring's shape
is `npm run press`, which is not in CI and sets its settings by writing into the
debug hook's copy (the pattern `depth` had); worth bringing into the tools shard.

And the gap's drag takes the ferrofluid's own viscosity, by share (`hsPrep`,
`FERRO_NU`, 5 mm²/s, a light hydrocarbon ferrofluid's). Which way a front fingers then
follows the two liquids (Saffman–Taylor): on the default plate (Thickness 0.45, a light
oil of 22 mm²/s) the ferrofluid is the thinner, so a press pushing it out into the oil
is the unstable direction, and a bumpy pool's outline keeps more of its bumps (its
spread over its radius 0.023 → 0.013 against 0.009 for an even pair, `ferropress`
§5); in water it is the thicker, the press rounds it a little more (0.008), and the
lift is the unstable one. The same drag sets how fast the ferrofluid answers any
body force under Thin Gap, the magnet's included: about 4.4 times faster than before
(its drag is 0.22 of the default oil's), in any clear liquid since 18a-2 (before it,
the pull itself scaled with the clear liquid's viscosity, so in water the ferrofluid
answered about 5 times slower and in glycerine far faster; now only the liquid it has
to push aside slows it). That is the real liquid's answer, not a change to the magnet's code; the
owner's eye on it is in judging §23. The
phone's Press is the same press on the same solver, and Thin Gap is on its settings
sheet. Judged on the Mac: `docs/judging.md` §23.
