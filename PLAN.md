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
| 0 | The dye a tool makes | **Shipped** (#152); the fingering push that grew a grating of stripes, dots and labyrinths in every pool, and drained the plate, **taken out** (`npm run grating` §5), not yet seen on the Mac; real viscous fingering to replace it, open |
| 1 | Sharp liquid, and pigment in it | **Shipped**; sharpening retired, granulation stands |
| 2 | Lacing | **Shipped**; its 4–8 px gate moved to batch 3 |
| 3 | Drops, not rings | **Shipped** (#163): drops and bubbles as air pockets, shaded as a projector throws them |
| 4 | Liquids that behave differently | **Shipped**; milk's opacity still owed |
| 5 | Playing it | Sound learn **shipped** (#155, on #154's bands); shutter and look link **not started** |
| 6 | Render a song | **Shipped** (#153 seed, #154 offline bands, #156 render); the 3-minute 1080p gate is unmeasured |
| 7 | The room in the plate | **Shipped** |
| 8 | The desk | **Shipped** |
| 9 | Ferrofluid after the references | Sharp edge and two looks **shipped** (#161); maze detail **shipped** (#167); dye carried **shipped** (#168); the magnet's spikes, 9e, **shipped** (#183, with the phone's fingers as magnets), not yet judged on the Mac; fingers past the spikes, 9i, **shipped** (#200, `npm run fingers`), not yet judged on the Mac; Blow and Finger move it, 9n, **shipped** (#206, `npm run ferrohands`), not yet judged on the Mac; picking the Magnet no longer gathers a black pool in the middle, 9s, **shipped** (`npm run magnet`), the pool it sets down is 9u, open; 9f–9h, 9j, 9k–9m and 9o–9r open |
| 10 | Playing like a show | Step 0, film every look, **shipped** (#162); its first full baseline not yet run; step 1, rest, big events and darkness, **shipped** on the sequencer (#170), not yet filmed; step 2, the song's shape, **heard** live (builds, drops, breakdowns; `npm run shape`) and **followed** by Pacing (#182, Follow the Song; `npm run pacing`), not yet filmed; step 3, accents, the one **shipped** (#184, Accent the One; `npm run downbeat`), not yet seen on the Mac, every other bar, fills only, a hand's variation and a press pulled onto the beat not started; step 4, press round and lift into fingers, **shipped** (#185, `npm run lift`), not yet seen on the Mac, and Beat Squeeze, found never to have pressed the plate, **pressing** on every kick and let go after each (`npm run lift`, `npm run squeeze` on the Mac), not yet seen on the Mac; step 5, oil and water as bodies, **shipped** (#179, Oil Bodies, on in Oil & Water), not yet judged on the Mac; steps 6 and 7 not started |
| 11 | The mixer | Step 1, the sources there are in one stack with a grade each, **shipped** (#176); step 2, the gel wheel and the lumia as rows, **shipped** (#189); step 3, a blend per row, **shipped** (#193); step 4, a take button and fade time per row, **shipped** (#195); step 5, the desk's Mixer over the rides and not the plate, **shipped** (#196); none yet judged on the Mac; step 6 waits on rig-plan R1 |
| 12 | The App Store and Google Play (at the end of this plan) | An iPhone shell (Capacitor) and an Android one (Trusted Web Activity) planned; step 1, the site on a phone, **passed** on the iPhone (Safari, 2026-09-27), Android not yet run; step 4, the iPhone shell, **built** with the laptop-remote mode (4a), compiled in CI, not yet on a phone |
| 13 | ChromaGlass in popular VJ software (at the end of this plan) | Planned 2026-09-27: a small native wrapper (Electron) first, with the whole show cached offline and the show server inside, then video out through Syphon, NDI and Spout, OSC control, Ableton Link and video in; nothing built |
| 14 | The show at the gig: hearing, timing, speed, the wall (at the end of this plan) | Found 2026-09-27 by reading the code: the show goes deaf behind the projector window (14a), the wall can draw twice a refresh (14b), the projector's pixels come from the laptop's ratio (14c), the beat clock hears smoothed bass (14d). 14a **shipped** (the ear keeps hearing behind the wall, and says when it is deaf; `npm run ears`), not yet seen on the Mac with a real covered window; 14c **shipped** (a wall's pixels are the wall's: a Retina laptop on a 1080p projector opens at 1920×1080, was 960×540, and is offered 1024²; a 4K wall's bottom rung is 2.07 Mpx, was 8.29 like its top; the mirror smooths at 'high'; `npm run rungs` 70/70, was 63/70), whether 1024² holds on a 1080p wall not yet measured on the Mac; 14d **shipped** (the clock hears the kick's onset, by its time; `npm run kicks`), not yet counted in the app on the Mac; 14b **shipped** (one draw a refresh with the wall up, whichever window asks, each offer stamped with its refresh's own time: `npm run wall` 119.1–120.2 draws a second on a 60 Hz display before, 59.8–60.3 after, and 60.0 with 11.7 ms draws where the first version drew 68.7; covered, every ask draws); on the Mac runner, with a renderer, `npm run wall` 187/187, the governor fed a whole refresh of the faster window; 14f **shipped for the sound** (the ear tells React ten times a second and the plate asks for each frame's reading itself: the App renders 11 a second with the band, was 70, and a quiet page only its clock, was 5; `npm run renders`; on the Mac the plate heard its own frame's reading on every frame), the MIDI fader's half still open |
| 15 | Every tool on every liquid | Audited 2026-09-27 (table in 15); 15a, every laying tool lays the bottle, **shipped** (`npm run bottles`, Mac); 15d, the Press moves the oil with its colour, **shipped** (`npm run pressoil`), not yet judged on the Mac, the ferrofluid's half open (9n, which it waited on, shipped in #206); 15b, 15c, 15e open |
| 16 | Many plates (rig-plan R1, at the end of this plan) | Picked by the owner 2026-09-27 ("Let's build multi-plate next"); planned in five steps. 16b, a projector picks its source, **shipped** (#226, `map`, `mixer`, `wall`), not yet seen on the Mac; 16a, the back plate's own look, built but never opened as a PR and its branch lost, so to be rebuilt; 16c–16e not started |
| 18 | The physics under the look | Audited 2026-09-28 (section 18): the shortcuts where the plate imitates a liquid's result instead of simulating it, ranked by gain against GPU cost; the top four are the plate as a Hele-Shaw cell (18a, which the tools' 15b/15g and the grates thread's fingering wait on), the lamp through the dye (18b), a pour that adds liquid (18c) and each liquid's real properties (18d). **18a first part shipped** behind Thin Gap (off in every look; `npm run thingap`); 18a-2 to 18a-11 left, each its own PR |
| 19 | The checks, the build and the plan itself (at the end of this plan) | Found 2026-09-28 in a review of the workflows, the harnesses and the build: `gallery.yml` holds the Mac runners (19a), Measure is near its timeout (19b), checks that can pass unmeasured or that nothing runs (19c), the build (19d), the harnesses as code (19e), the plan out of step (19f); nothing built |

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

**Deploys no longer re-measure a tree its PR already passed** (this PR, `npm run
deploygate`). Measured 2026-09-27, 1 AM to 11 AM PT: 18 red runs, 5 of 16 deploys.
Every deploy re-ran the four Mac shards; 16 of the last 20 merges published exactly
the tree their PR's `Checks` had just passed on, and 3 of the 5 red deploys (#189,
#195, #196) were that tree going red the second time on a check nothing in it
touched. `deploy.yml` now skips the checks when the tree is the PR run's (the head
contained main, and its run was green) and runs them in full otherwise. It halves
the Mac jobs per merge, which is also what had run times at 20–55 minutes by noon
against 10 at 1 AM.

*Found 2026-09-27, not yet done:* the checks that went red on deploys that day, on code
they do not measure (besides the Finger, the mirror and the wall's gain above): Beat Squeeze on two deploys (#190's,
"with the band playing, the show hears kicks — 3 in 45 s"; #195's, "the tapped beat
drives the show's clock — 149.5 bpm tapped at 122"), the ear on #195's deploy ("the
wall only where the frames stalled past 250 ms — 0 of 10 read within 250 ms"), the
phone's two-finger Drop on #186's deploy (B 81 against 2/0/0, fine by eye; the check is
split in two in batch 11's note on it), `qa` on
#189's deploy with no WebGPU adapter in 10 s, and `startup`'s GPU-start stop at 3.52 s
against 3.5 on #194 (that one: see the `startup` item in §0's CI list, fixed by
telling Chromium's hold on the page apart by the page's own thread). Each wants what §0 asks of the Finger: find whether the check or
the product is wrong, from the numbers it prints.

*Read 2026-09-28, on #216's show shard, a docs-only tree:* "the tapped beat drives the
show's clock" read a beat every 401.7 ms against 404.1 ms tapped, its second red, after
#195's 396.6 against 401.4; the runs of #203 and #211 on the same code read 405.8
against 405.8 and 403.2 against 403.2. The clock is not the suspect §11 names:
`setExternal` is handed the tap's reading right before `update` on every frame, with the
same `now`, so every frame ends on the tempo source's own period, and nothing in the
check clears the tap (only Tempo: Listen Again does). The two numbers come from two
stopwatches. The check stamps each tap in the page just before `chromaglassAction('tap-tempo')`, and the app stamps it again
inside `tapTempo`, so a pause between the two stamps (a collection, or the first call
into `runAction` on a busy runner) lands in one and not the other. Both reds read the
app's mean shorter, which is what a late first stamp does, by 14.4 and 7.2 ms over the
three gaps, where the check allows 6. This is read in the code, not run. *Proposed:*
`chromaglassDebug()` returns the tempo source's reading. The check then asks that the
clock's period is that period to within 0.5 ms (the feature: the tap drives the clock).
Separately, allowing for dispatch, it asks that the app's taps are the harness's
(a tap dropped or doubled moves the mean by a third or more). The `check-skeptic` holds
both halves red.

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
Still to see: the Finger's check on the Mac over a run of builds, and whether the
looks with Polarity have lost an edge movement the owner liked (docs/judging.md
§20).

*Found 2026-09-27, not yet done:* **real viscous fingering.** In a Hele-Shaw cell
(two glasses and a gap b) the flow is Darcy's, u = −(b²/12μ)∇p, and an edge
between two liquids fingers only where the thinner one is driving into the
thicker: growth σ(k) = U|k|(μ₂−μ₁)/(μ₁+μ₂) − b²γ|k|³/(12(μ₁+μ₂)), so the surface
tension γ across the edge sets the finger width (fastest near λ = πb·√(γ/(ΔμU)))
and a still plate does not finger at all. The solver has the pieces: the gap
(vel.w, the squeeze), a drag through it (Depth Drag), a Jacobi projection, and
liquids with a `body` in the liquid field; and a Hele-Shaw thin-gap mode (§18a, #220: Thin Gap,
off by default) brings the mobility-weighted projection and the gap's
drag, so this builds on it. Build: a viscosity per liquid carried
with the dye (water thin, the pools' oil and syrup thick); the gap's drag 12μ/b²
on the flow, per cell; the projection weighted by the mobility b²/12μ on each face
(a variable-coefficient Poisson solve, the same Jacobi); and a capillary pressure
jump γκ at the edge. Then a lift (§10 step 4) fingers because water or air is
drawn in, a press does not because it is the stable direction, Polarity and Blob
Surface Tension mean a viscosity contrast and a γ, and `squish.ts`'s drawn spokes
(a shortcut of the same kind) can go. Checks: a radial lift's finger count against
the fastest wave for its b, γ and U; a press stays round; a still plate grows
nothing (`npm run grating` §5 asks that already).

*Found 2026-09-27, not yet done:* **#174's grating may have been this one.** Its
report was "Red Cabbage at 2.8x", read as the closeup's zoom, and its pixels
converted to cells at 8.75 px a cell on that reading. 2.8x is the tool's Amount
(the dock's `2.8×`); a report saved with the camera at 1x reads `shot.zoom 1`,
and at 1x a cell is about 4.7 px of a Retina screenshot, so its 10–15 px stripes
were 2–3 cells, not √2. Red Cabbage has Polarity, so the push ran there too. The
`dampGrid` pass stays (it removes a pattern nothing else does), but its cost on
the Mac (judging §10) is worth weighing against what it was for.

*Found 2026-09-27, not yet done:* **the owner likes the dots.** A "Roy" look with
its own control is being built in its own thread from the old push's mechanism
(anti-diffusion on the dye, a wavelength set by the gradient's reach, bounded by
the advection's hold and the 6.0 cap).

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

*Found 2026-09-28, not done:* the downbeat exists now (the bar grid's one, #184, Accent
the One), but sound learn still fires `bar` on every fourth beat it has counted since
the clock locked (`beatIndex % 4`, `soundLearn.ts`), so "Each bar" lands on whichever
beat the lock began on. Take the bar grid's one when the grid is sure of it (its own
0.15), and the count only when it is not. *Measure:* `npm run learn` with a song whose
lock begins on beat 3: the bar fires on the one.

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

**An ear per input channel** (*proposed 2026-09-28*). The show hears one input and
splits it into kick, snare and bass by what the spectrum suggests (`audioFeatures.ts`).
A band's desk can send more than that: the kick mic, the bass DI, the vocal bus and a
room mic, on separate channels of one interface. Open the input with its
`channelCount` and a `ChannelSplitter`, and make each channel a named source beside
the analyser's: the kick's onset from the kick mic, the vocal bus for the lyrics and
for presence, the room mic's roar as a sound-learn source. Browsers differ above two
channels, so it is surest in the Mac app (§13 step 1). The phone's Sound sheet gets a
meter and an on/off per channel. *Measure:* `npm run bands` on a four-channel file with
a kick on channel 1 only: the kick onset follows channel 1, not the mix.

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

- **9j. Spikes that follow the music.** A real ferrofluid speaker's spikes jump on the
  kick. The spikes now answer the magnet's field, so the maze's audio breathing
  could drive their height too.

Open, from building 9i:

- **9k. More fingers, and a labyrinth in the middle.** The reference ("Magnetic
  pattern I") has sixty or more fingers round a pool and its middle turns to
  stripes; ours has about sixteen, and the middle stays a field of domes (9e's
  spikes win there). A finger's neck also thins to about half full on its way
  out, so a finger reads as a round tip on a grey stem in the field: the plate
  draws the half-full line and shows it whole in the lab, but a Mac look should
  say whether it breaks up at 60 fps.
- **9l. The magnet still has to pull under a Labyrinth.** Under a maze field the
  pull under the hand was already halved with the spikes (SPIKE_PULL); the longer
  push now works against it too. `npm run magnet` (Mac only) holds that a pool
  still follows the magnet when it is dragged, on Classic; nothing holds it on
  Magnet Garden.
- **9m. The spikes' outline margin is thin.** `npm run spikes` asks for an outline
  2.78 times a disc's; it reads 2.85 now, 2.62 with the finger push reaching all
  the way in. Anything that softens the spikes' repulsion will turn it red.
- **9o. Fingers on Classic.** With no Labyrinth the Magnet only gathers: no
  fingers past the spikes. A push of the hand's own there (tried in 9i) either
  stopped the magnet gathering scattered drops, with the pull eased, or drew
  grey fingers (7, 1, 0 and 0 on `npm run fingers`' circles), with it whole:
  Classic's Phase Edge, 0.35, separates too slowly to keep up with the flow
  pulling them out. Wants a push that switches on only once the liquid has
  gathered under the hand, and a floor on the separation's speed there.
- **9p. What `npm run fingers` does not measure.** The magnet between no spikes
  and full (a low Tool Amount, or a Ferrofluid Scale that holds it higher),
  where the push ramps in; and a maze look's labyrinth far from the hand while
  the hand is held: the hand's share (spikesClose) is one number for the plate,
  so the push leaves the far labyrinth's separation too, and it rests on the
  maze's flow alone there.
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
- **9q. A Mac check of the hands on the ferrofluid.** `npm run ferrohands` measures
  the carry with the app's own numbers (lib/handCarry.ts) but not the app's calls:
  which method each hand reaches, the Finger's carry waiting on each reading of the
  dye, how often a hand acts, and a moving Blow's held direction. A check through
  the real pointer on Magnet Garden, reading the phase before and after, belongs in
  `npm run tools` on the Mac.
- **9r. The Finger's carry searches when it need not.** `phaseCarry` gathers each
  cell's share from every cell within the hop, which only a puff (straight out)
  needs; along a stroke exactly one cell can land on each, and could be read
  directly as `mixCarry` does. The remote's widest directed Blow at 512² is about
  4000 reads a cell over 28 000 cells. Worth doing if a Mac frame-time reading
  under a held Blow shows it.

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
- **9u. A set-down magnet still gathers a pool with no domes.** What the hand leaves
  behind (strength 0.8 at the look's height, 0.225 at Classic's Scale) is a field
  share of 0.15 on its axis, under the spikes' onset (0.18, `spikes.ts`), so it pulls
  the ferrofluid into one flat black pool where the hand let go. A real magnet strong
  enough to pull a pool across the dish raises Rosensweig domes on it, and the pool
  is never one flat disc. That is the pull against the lift: a thin-film lab of the
  Rosensweig instability (2026-10-03, not yet in the repo) found the plate conserves
  the ferrofluid's area where a real layer conserves its volume, so domes standing up
  cannot open gaps, and its magnet case piled the pool 0.84 of a capillary length
  deep before domes came, with the balance of pull and lift left open. It belongs to
  the standing-domes plate PR that lab is for, not to a retune of the set-down
  strength here.

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
     **Shipped** (with 14d): two causes, both measured by `npm run kicks`, which plays
     the band's own score (`bandStep`) through the live ear. The clock's onset, the
     smoothed bass crossing 0.45, never crossed in the chorus, where the sawtooth
     bass holds the level over the line: 59 of 160 chorus kicks heard at 20 fps (110
     at 60). And a loop reading the onset's `hit` loses the kicks that land on
     readings it never sees, since the ear reads at 60 Hz and the loop is handed the
     latest reading: 46 of 160 at a 20 fps plate. The clock and the song's shape now
     read the kick's onset by its time (`at` moving), and the onset calls a kick that
     lands with a bass note (next item but one): 155–160 of 160 chorus kicks, every
     intro and verse kick bar one, at 60, 30 and 20 fps, 48 and 44.1 kHz, late frames
     or not. The
     band's scheduler was not a cause (0 of 62 kicks late on the cloud's busy page,
     `window.__band()` under `?debug`). Still owed: the count in the app on the Mac
     (next item). What was found:
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
   - **Count the heard kicks in the app on the Mac.** `npm run kicks` hears the band
     offline, through the ear's code; nothing yet counts it in the running app, where
     the plate's frames and the band's timer share a busy page. Both counts are there
     under `?debug`: `chromaglassDebug().heardKicks()` (onsets the loop saw) and `window.__band()`
     (kicks the band scheduled, and how many late). *Check to write:* a Mac check
     that plays the band for 30 s and asks for nine in ten of its kicks heard.
   - **A kick with its bass note read as low mids.** **Shipped** with the item above.
     The kick onset would not fire when a frame's new energy at 150–400 Hz came
     within 6 dB of the new energy under 120 Hz (`KICK_TILT_DB`, which keeps snare
     bodies off the kick). The band starts a bass note on every kick, and its
     harmonics put the kick's lead at 3.9–5.9 dB: the ear called 134 of the chorus's
     160 kicks at 48 kHz and 124 at 44.1 kHz (a Mac runs at either; the bins fall
     differently), and 4 of the intro's 31. At 3 dB it calls all of them at both
     rates, and the lone snare in `npm run bands` still fires no kick (it first does
     at 1 dB). `npm run kicks` now runs at both rates and holds the ear's own onsets
     to 95 % in every section. Not yet heard on real records: a kick under a bass
     guitar played on the beat is the same case, and a floor tom the other side of
     it, and `bands` has no tom.
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

*Proposed 2026-09-28:* **Go on the music.** A Go is immediate and its fade is in seconds
(`sendLook` → `fadeSettingsTo`; a set item's `fade` is seconds), while the Mixer's takes
already fade in bars (`barsToMs`, #195). A performer wants the change to land on the
music: Go on the next bar, in 4, 8 or 16 bars, or at the next section the song's shape
hears (`barGrid`'s one, `songShape`), with the fade in bars. Beside it a **T-bar**: a
learnable fader, and one on the phone, that scrubs the fade from the look playing to the
one armed, by hand, with soft takeover, and a Go that completes it. It is the hand's side
of §17's anticipation. On the phone a long press on Go arms "on the bar" with a ring
counting down, and the Looks sheet gets the T-bar. *Measure:* `npm run setlist` for the
arming and the count; `npm run downbeat`'s song for a Go that lands within a frame of the
one; `npm run desk` for the T-bar's soft takeover.

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

Found while shipping step 4, not yet done: #195's deploy (main 6c6d17e) went red on
two Mac checks that passed on the same tree in its PR run and again in #196's run
right after, so step 4 went live only with #196. `npm run ears` on the open shard:
"visible with the wall asking too" drew 14 frames in 2 s where it asks more than 20
(35 in #196's run); every reading was in the right place, so the floor counted the
runner's frame rate, not the ear, and the "Gaps in the plan" thread has a fix on #194.
`npm run squeeze` on the show shard: "the tapped beat drives the show's clock" read a
beat every 396.6 ms against 401.4 ms tapped (2 ms allowed), with the plate stepping
255 times in 12 s where it steps about 320; the Mixer's fades only read the tempo. The
tempo the taps set is the plain mean of their gaps, so something moved the clock off it
after the taps; worth reading whether the clock falls back to the heard beat when a
frame comes more than 250 ms after the last (`beatClock.setExternal`'s window).

Found while building step 4. Changed here, for the owner to confirm: Back reverts the
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
  **A third time on #196 (ed42edd, 2026-09-27 16:04Z)**, a desk-only change: A 81
  against B 221, 0.37, the mirrors clear, 0.0 cells of drift, 100 readbacks. The
  three low fingers read 62, 81 and 81 and the high ones 181 to 234: one finger
  laying about one drop's dye and the other about three, where a phase difference
  between the two fingers' drop clocks (each counts DROP_EVERY solver steps from its
  own touch) can only make them one drop apart. So look at what can take a whole
  drop away: a drop's splash (`autoInject('drop')`) carried out of the measuring
  disk, or two drops on one spot capped at the plate's density ceiling.
  (#186 changed where a press lands; the held Drop's splash lands on whole cells
  already, so it lays the same as before.)
  **A fourth time on #208 (3a0fcf8, 2026-09-28): A 201 against B 65, 0.32.** Read
  2026-10-03 against the 35 other Mac runs of the last two days: that one red, and
  the pairs that passed read 0.46 to 0.98 of each other, at 74 to 269 a finger, both
  fingers 52 cells from the middle every time. Classic lays the Drop as a stream
  (Drop Height 0), not drops, so the drop-clock theory above was not this check's:
  both fingers lay on every step from the second touch to the lift, by the code. So
  the check is now two, and the next red says which half: **what each finger laid**,
  by the app's own count (`chromaglassDebug().hands()[i].laid`: steps held, drops,
  dye handed the solver; each held to the steps the plate itself took with it down,
  and the same dye a step for both), and **what the plate holds**, the dye under
  each finger against its mirrors as before, at least a fifth of its nearest dye
  still inside its disk, with the balance asked of the dye nearest each finger
  (within three disks, nearer it than the other) instead of one disk, so a pool the
  plate carried off its finger's cell in the 1.9 s is still counted as that finger's.
  *Still open:* why the plate's two pools of the same steps differ by up to 2.5
  times on a cleared plate. The line now prints the disk and the nearest-dye readings
  side by side, so a red with equal counts and unequal nearest dye is the plate
  losing one pool's dye, and equal nearest dye with unequal disks is the plate
  moving it. Both halves were shown red on the Mac before merging, each on a mutant
  pushed to the PR and reverted. With B's dye reaching the plate at a third, the
  plate half went red (A 194, B 72, 0.37) while the count half stayed green (A 28
  steps and 222 dye, B 26 and 206, against the plate's 26 to 30 steps), as it
  should, since both fingers had laid alike. With B laying on every other step, the
  count half went red (A 23 steps, B 11, against the plate's 21 to 25), and the
  plate half stayed green at A 101 to B 61 (0.60). A half-rate finger is inside
  the plate's own scatter, so the plate's balance could never have caught it. On
  both runs, the dye nearest each finger equalled the dye in its disk, so in these
  1.9 s the plate does not carry a pool off its finger. A red with equal counts is
  therefore dye the plate lost, not dye it moved.
- **Found while reading it, and fixed with it: a held Drop with Drop Height up let
  go of a drop on every step, not every tenth.** Its clock (`dropClockRef`, and each
  finger's own) was counted up only past a frame's first step until it had started,
  so on frames of one step each, a plate stepping at the display's rate, it stayed
  at 0 and every step was a drop: 60 drops in 60 steps where 6 were meant, 33 with
  one two-step frame among them (simulated over the old and new counting); ten times
  the dye and a splash on every step until the first frame that happened to owe two.
  Counted after each step it is used on, the first step is still a drop at once.
  `npm run phone` counts a held finger's drops against its steps on the Mac shard.
  It cannot show the old clock there: the Mac runner's phone section steps
  less than once a frame (14 to 18 steps over 15 to 20 frames). That makes two-step
  frames common, which unstuck the old clock, so the old clock passed too (2 drops
  over 16 steps). The arithmetic above is the evidence for the fix, and the owner's
  look at Bass Drop and Boiling Point at 60 fps is the check (`docs/judging.md` §19).
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
  stop before the device is given rather than only the first. Again on #194's run
  on 5fd3636 (2026-09-27): 3.52 s from 1.04 s, the device asked at 0.83 s and given
  at 4.56 s, while the control's stop at the GPU's start began at 1.43 s, so the
  check's 0.25 s match to it missed and the stop counted as an opening stop. #194
  changes nothing that runs before the device is given (its ladder is built once a
  device and a stage exist); 5fd3636's parent 1d842d1 passed the same shard.
  **Fixed (this PR):** the moment a stop begins is not what makes it Chromium's.
  Over 53 open-shard logs of 26-27 September, every opening (the control's and the
  show's) drew no frame for 1.25 to 4.2 s from about 1.0 to 1.4 s after load, and in
  every one whose timeline was printed the page's own timers stopped with the frames
  and no long task of the page's lay in it: Chromium holds the page's whole thread
  while it starts its GPU, and lets go within a tenth of a second of handing over the
  adapter or device. The show's own stops leave the page's timers running (the nine
  second freeze #164 fixed; the stop after the first step #181 fixed). #204's red (run
  36346188828) was the old rule's matching: a 0.15 s long task let one frame through
  at 1.41 s, the rule matched that sliver and the 2.58 s rest went to check 4. Now a
  tick every 100 ms marks the page's thread; any stretch of half a second or more,
  beginning in the first 3 s and ending before the first step, with no frame, no
  tick and no long task, and not begun where a promise the page awaits had just
  settled, is time the thread was held from outside, taken out of check 4's frame
  gaps and held by 4b to 4.5 s all told. If long tasks cannot be seen or the timer
  runs slow, nothing is taken out. The settled promises are there because the
  check-skeptic review found that the page's own JavaScript run after an `await` on
  a WebGPU promise (all the show's GPU setup) is never a long task: a second of it
  looked exactly like a held thread. Long animation frames were tried first and
  fail on the Mac: Chromium's own hold was one too (2.94 s from 1.01 s, run
  36353565837). What does tell is that the page's code after an await begins the
  moment its promise settles, and Chromium's hold begins with the adapter or device
  still pending. In a cloud session (`ci-flakes/startup-lab/probe7.mjs`) a second
  of busy code after awaiting requestDevice, a pipeline, fetch and work done each
  read as the page's own, and a renderer stopped from outside for 2 s read as held.
  *Still open:* a continuation of something the check does not wrap (an `import()`)
  would look held; the 4.5 s cap is the backstop. The long animation frames stay
  printed with where their rendering began, in case they can tell later. On this
  PR's green run (36364179427) the show's hold at the GPU's start, a 2.08 s frame
  gap that check 4 alone would have failed, was taken out as held (2.05 s). *Open:*
  the control's hold on the same run (3.82 s from 1.05 s, inside its device
  request) read neither held nor the page's own; the control is not judged, and a
  miss there can only make the show red, never pass it, but the opening line now
  prints what 4b made of each page's wait so the next runs say why. The old "within 0.25 s of the control's stop" and "control plus a second" are
  gone. Read against the 53 logs: #204's red and 36339282520's split stop (1.28 s
  then 1.68 s) now count as one held stretch each, 2.57 s and about 3 s; 2 of the 53
  (4.05 s on 36294600123, 3.75 s on 36338802046, each wholly inside a four-second
  device request) went over the old 3.5 s cap, as did #194's 3.52 s; the owner chose
  to raise it to 4.5 s, above every opening read (the controls' longest 4.18 s).
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
- `phone.mjs`, "portrait: set to one bar in the drawer, the same take lands in about
  half the time": on #210 (the Press; no mixer or phone code) it landed where it
  should (0 at 1944 ms against two bars' 3849 ms; #201's run 1936 against 3838) and
  went red on "with a jump", whose size the line did not print (it does now). The fade is stepped by
  a 16 ms show interval against the show clock and the slider shows React's state,
  so a main thread that stalls on a busy Mac runner moves the level a stall's worth
  at once, and at one bar the allowance per 80 ms sample (0.106) is half two bars'.
  Worth printing the largest step and its gap first, then asking whether the walk
  should stamp the level with the show's time rather than the harness's.
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

**This file is too big to read whole** (about 150 KB, 38k tokens; 2026-09-27). Every
session told to read it carried it in context for the rest of its life, and the
shipped batches are most of it. CLAUDE.md now says to read one section. The fix is to
move shipped batches to `docs/plan-shipped.md`, keeping a line each here, in a PR of its
own when few branches are editing this file (every open branch touches it).

## Operating rules

- A sandbox has no GPU worth the name, so a WebGPU fallback adapter classifies as
  `software` and gets one 256² rung. Every look is still judged on the Mac's GPU before
  the next batch starts.
- One Mac session at a time, committing from a worktree, never while a show is
  running: two sessions in one checkout have already trodden on each other's server
  and files.
- Every new setting is MIDI-learnable, reachable from the phone, and defaults to the
  current behaviour so a preset made today still looks the same tomorrow.
- Every feature ships its phone version in the same PR, not after (the owner, 2026-09-27).
- This plan is kept current: every PR that ships a batch step marks it shipped here,
  and anything found along the way that should be fixed or added goes in as an item,
  in the batch it belongs to or a new one (the owner, 2026-09-27).
- The repository is public, so it names no one: "the owner", not a name, email or
  machine (2026-09-27). Squash-merge commits made on GitHub still carry the merging
  account's email unless that account keeps its email private in GitHub's settings.

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

**Running order.** Steps marked *(owner)* need the owner's phone, card or account.

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
4. **The iPhone shell** (one PR): Capacitor's `ios/` project with `webDir: dist`,
   no service worker in the app, permission strings, status bar hidden, minimum
   iOS 26, and an `xcodebuild` step on the macOS runner. ***Built*** (the "iPhone
   app" workflow compiles it for the simulator; `npm run ios` opens it in Xcode on
   the Mac), not yet run on a phone (`docs/judging.md` §16). Changed from the
   plan: the app takes the website's quality ladder, not the `native` tier's,
   because `capacitor://localhost` read as a laptop serving itself and would
   have offered a phone 1024² at three device pixels (`detectTier`, checked by
   `npm run applink`); it gets more once a phone's heat over a set is measured.
   Still owed from this step: the audio session (music through the speaker
   while the mic is on) and the idle timer, which lean on WebKit's own
   handling until the phone shows whether they need native code; the home
   indicator.
4a. **The app is also the laptop's remote** (asked for 2026-09-27: "make the
   remote control work on the iPhone app … switch back and forth between
   modes"). More › Laptop remote asks once for the laptop's address (paste the
   Phone line `npm run remote` prints, or type it) and remembers it; the remote
   carries it as `?relay=` and connects there, since the app's own origin has
   no relay (`src/lib/appLink.ts`). Play here goes back to the plate. Only in
   the app: the website's https page cannot open a plain ws:// socket to a
   laptop. Only the app's remote follows `?relay=`: review found that the
   laptop's display followed it too, so a crafted link opened on the laptop
   handed its show key and the show to any host it named; fixed before
   merge. `npm run applink` (Measure) checks all of it on a real relay with a
   stand-in laptop, the page on another origin and a stranger's host. ***Built***, not yet on a
   phone. Open: the iPad in the app gets the full layout, which has no Laptop
   remote button yet, and neither does a phone that took More › Full layout
   (until the app is reopened); a QR code on the laptop that opens the app straight
   into its remote (a `chromaglass://` link) would save the typing.
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

**The wrapper comes first** (the owner, 2026-09-27: "Would a good option be to create a
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

**Running order.** Steps marked *(owner)* need the owner's Mac and a VJ app on it.

1. **The wrapper** (one PR): an Electron app for the Mac with the built site inside
   it (offline from the first launch), the show server started with it, the show
   window opened on the projector with no click needed, background throttling off,
   and a macOS build on the CI runner. A check loads the packaged app with the
   network off and sees a lit plate. *Not started.*
2. **Syphon out** (one PR): a native add-on that publishes the plate as a Syphon
   server from Electron's offscreen shared texture, with no readback. Then *(owner)*:
   the plate as a layer in Resolume or VDMX on the owner's Mac, with the delay measured
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

With every phase: at least 0.9 times what the show drew alone (a gate turning
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

*Still owed:* the owner's look with a real projector on its own display. And stepping down under a wall at all: it is new behaviour, from 14b and
14c together (the governor fed real intervals now, and a ladder built from the stage),
and nobody has seen it happen on the Mac.

*Found along the way, not done:*

- *A 120 Hz laptop with a 60 Hz projector draws 120 a second.* The gate works to the
  faster display so that neither window gets fewer frames than it would alone, which
  keeps the desk at 120 on a ProMotion screen; but every draw carries the mirror
  copy, and the wall shows only every other one. Pacing to the projector while the
  show window is not what the audience is watching would halve that work. Measure:
  the arithmetic case 120/60 with the draws counted against the wall's refresh.
- *The wall's older "asking for one draws one" line cannot fail on the ask.* It asks
  thirty times with the show's own frames running and counts every frame drawn, so
  the show's own clock alone passes it (and did before this: 60 a second is over its
  twenty in half a second). The new "covered, every ask the wall makes draws" line is
  the one that measures an ask; the older one should be run covered, as that one is.
- *The full app on software WebGPU loses its device every few seconds* in a cloud
  session ("A valid external Instance reference no longer exists", after about sixty
  frames, then some six seconds to recover), which is why the app's pixel checks
  cannot run there even with `PW_WEBGPU=1`, not only its readbacks. Worth knowing
  before anyone tries to make them.

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

**Shipped.** The loop hands the clock the kick's onset and the time it landed (the
reading's `at`, watched for a change, so no kick is lost between frames), and `npm
run learn` drives the clock that way at the shipped trust, 0.7. `npm run kicks`
measures it on the band's own score: locked after 8 kicks at 60, 30 and 20 fps (8
or 9 before, the heard kicks it did lock on being early ones), 170 of 256 kicks
fired ahead at 20 fps against 99, lead −8 ± 13 ms (−14 ± 20 before). The phase
pull was tried at 0.3 and did no better on this band (spread 18 ms against 13 at
20 fps), so `hear()` still snaps: with the onset's own time the snap's jitter is
the onset's, a few ms, not the smoothed level's 30–55.

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
not take more); the visible app drew 28 frames a second in the same run. On #195's
deploy (main 6c6d17e) the visible page drew 14 frames in two seconds while the rest
of the show was still being built behind it, and `npm run ears` went red on a floor
of twenty frame readings, with the ear doing what it should (the wall's 10 asks all
read in the page's stalls). The floor now asks that every frame the page drew read
(#194); how slowly a busy page draws is this item's to fix, not that check's.

*Fix:* the frame loop reads the analyser and the ride's shadow itself; React keeps
the meters, at about ten updates a second, with the arrays reused. *Measure:* count
`App` renders a second under `?debug` in `npm run desk` with a stream running (12 or
fewer), and stamp the reading's time against the frame's.

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

Still open here: the MIDI half. A fader still re-renders the App once a frame while
it moves (`rideSetting`: the ride drains into `setSettings` on an animation frame), by
design so the desk shows the value; reading the ride's shadow in the frame loop and
showing the desk's value at ten a second is the same split, not yet done. And the
reading's two byte arrays are still new each reading (about 60 KB a second), not
reused: a listener may hold an older reading, so reusing them needs the readers
checked first.

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

### 14l. LiquidVisualizer.tsx is one 9,400-line component

**Suggested 2026-09-27 (a review the owner passed on); measured by line count only.** The
show's component holds the WebGPU renderer's lifecycle, the frame loop and its gates,
the pointer, touch and magnet handling, the cast and projector hooks and the debug
surface, in one file several threads edit at once. Split it into a renderer module
the loop drives (no React), hooks for the fingers and the wall, and a thin component,
one piece a PR, each with `lint`, `panel`, `desk`, `phone`, `wall` and the Mac's
`tools` and `qa` green. Not while the file is under active change in other threads.
`React.memo` on the panels only where a render count (the one 14f adds) shows a panel
rendering for props it does not use.

*Found 2026-09-28, not done:* a second reading of the code, this time for what a
stranger on the network, a stale callback or a knocked device does to a set: the show
server, the ear, the desk and the shell, read as the pass above was, against the plans
first. What it found in the recovery paths is `docs/stability-plan.md` S14–S21, the GPU
step's cost `docs/webgpu-plan.md` H2c, the report Worker's limits `docs/crash-plan.md`,
the room's lights, a load-in card and the show kit `docs/rig-plan.md` (R4, R5, R8), and
the checks and the build §19.

### 14m. Anyone on the venue's network can drive the show

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

### 14n. One malformed message can end the plate

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

### 14o. The song-ID Worker is open to anyone

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

### 14p. Show night runs whatever merged last

**Read in the code.** `npm run show` is `npm run update && npm run remote`, and `update`
is `git pull origin main && npm install && npm run build`. `main` takes several
sessions' merges a day, each as soon as its checks are green (CLAUDE.md), and each
deploys to the site. So the laptop at soundcheck builds whatever landed an hour before,
much of it marked "not yet seen on the Mac" in the running order above, and the hosted
site can change under a show that is playing from it. 14k's mixed versions at the
projector are a symptom of this; this is the cause.

*Fix:* a `show-*` tag, cut when the owner has judged a build on the Mac; `npm run show`
checks out the newest tag unless asked for `main`, and prints which; one command to roll
back to the tag before; a Firebase channel that serves the tag, for a show played from
the site; the Mac app (§13 step 1) bundles a tag, not `main`. *Measure:* `npm run show`
in a scratch clone with a tag behind `main` builds the tag's tree; the cast hello's
version (14k) matches it.

### 14q. The room's lights do not follow the wall

**Read in the code** (the `lights` effect in `App.tsx`; `server/artnet.js`). Every
50 ms the show sends each layer's mean colour and `master = blackout ? 0 : min(1, fill ×
1.6)`: how much dye the plate holds. It does not see the Dimmer, Pacing's fades toward
black (which ride the flash-gain uniform, not a setting), the flash guard, the Mixer's
levels or the output gain. So in Light Show Night the pars stay up through a near-black
scene the wall has faded into, and Blackout cuts them at once while the wall fades over
a second. The colour is a mean, so a magenta-and-cyan plate lights the room grey, the
fault the roadmap names for `sceneSense`. The flash guard does not reach them (14r).

*Fix:* send the master the wall shows (dimmer, pacing gain, blackout's fade, the guard's
gain, the output gain), and the dominant colour rather than the mean, from the probe's
tiles (14r). Fixtures with places, and sACN, are rig-plan R8. *Measure:* a check on the
master the App sends, beside `npm run lights` (which checks the bytes): at Dimmer 0.2,
through a Pacing fade to black and a blackout's fade, the master follows the wall's
brightness within a frame; a two-colour plate sends one of its colours, not grey.

### 14r. The flash guard reads one number for the whole wall

**Read in the code.** `flashGuard.ts` watches the frame's mean luminance (`probeTiles`
folds every pixel into one sum, `wgsl/probe.ts`). The photosensitivity guidance it is
written against counts a flash over a quarter of the screen: a flash of 0.4 over a
quarter of the wall reads 0.1 as a mean, at the line, and a smaller patch never counts.
The separate rule for saturated red is not implemented, and nothing looks at
high-contrast patterns, of which Ferro Maze (a black labyrinth on a white table, 9d) is
the case. The room's lights (14q) are not guarded. And the probe divides an older
frame's sum by the current frame's pixel count (`probe.ts`), so after a pixel-ratio rung
change (1.5× to 1×) one reading is 2.25× too bright and then drops back, which the guard
counts as a flash.

*Fix, after 14i's decode to linear light:* keep the probe's per-workgroup partials as
tiles; luminance and a red ratio per tile, counted over quarter-wall windows; the pixel
count kept with its sum; the same gain on the Art-Net master. No control on the phone,
by design; the guard's line on the desk and the phone names the rule that is holding.
*Measure:* `npm run wall`'s traces with a quarter-wall flash of 0.4 at 5 Hz (counted), a
full-wall red flash (counted by the red rule) and a 1.5× to 1× rung change (not counted).

### 14s. The ear: the input picker, Safari's second song, and song ID

**Measured in headless Chromium on 2026-09-28 where it says so; the rest read in the
code.**

- *The input picker never changes the input.* `chooseAudioInput` (`App.tsx`) is
  memoised on `[audioSource]` alone, and calls the `handleSourceChange` of the render in
  which the source last changed, when `audioStream` was still `null` and `audioInputId`
  the old one. Measured with fake devices: picking Input 1 and then Input 2 made three
  `getUserMedia` calls, none with a `deviceId`, and all three tracks stayed live. The
  interface picked at soundcheck is not the one the show hears until a reload, and each
  pick leaves another microphone open. Hold the handler and the stream in refs, and pass
  the id.
- *On Safari and iOS, every song after the first is silence to the ear.* Without
  `captureStream`, `musicStream` hands back the one `MediaStreamDestination`'s stream;
  `startMusic`, `handleSourceChange` and `toggleMusic` stop `audioStream`'s tracks, and
  then the same ended stream is handed out again. Measured in Chromium with
  `captureStream` deleted: the analyser's source was live after the first shelf track
  and ended after the second; the track-end advance goes the same way. Inferred for
  Safari: that context is made in `oncanplay`, outside a gesture, and never resumed.
  Never stop the destination's own tracks; resume it from the play gesture.
- *Song ID can switch itself off for the session.* Its silence branch sets `busyRef` and
  awaits `finalizeListen` with no `finally` (`useMusicIntelligence.ts`), unlike the two
  branches beside it: one throw leaves identification, the local match and the song-end
  detector off. A failed `decodeAudioData` in `songMap.ts` and an error in `capturePcm`
  (`fingerprint.ts`) each leave an `AudioContext` open. (14h's shared busy flag is the
  same flag, hung by a request rather than a throw.)

*Measure:* a browser check with Chromium's fake devices (the second input is opened by
its id, the first one's track ends); the same with `captureStream` removed (the source
is live after the third track); `npm run music` with a `finalizeListen` that throws once
(identification runs again).

### 14t. The clock and the controller

**Read in the code.**

- *The beat clock can hold half tempo for good.* Locked at twice the period, an onset
  between beats has `k = Math.round(0.5) = 1` and an error of half the period, outside
  the 0.3 window: −0.08. The next, on the beat: +0.15. It gains 0.07 every two beats and
  never halves (`beatClock.ts`). A half-note intro at 150 bpm, then four on the floor,
  drives `musicPace` at 75 for the song, and sound learn's bars are eight beats long.
  This is the clock's own; §10 step 3's half tempo above 148 bpm is the bar grid's.
  Halve when most off-beat onsets land near half the period, and double the same way;
  a half-note intro in `npm run kicks`.
- *MIDI timecode's full-frame locates cannot arrive.* MIDI is opened with `sysex: false`
  (`useMidi.ts`), and a browser withholds SysEx without it, so the `0xF0` branch and
  `TimecodeReader.full` never run in the app. `README.md` says both are read, and
  `timecode.ts` counts on full frames for a backward shuttle; `npm run timecode` tests
  the reader and not the hook, which is why it is green. Ask for SysEx when timecode is
  chosen (it prompts), or say in the README that only quarter frames are read, and
  check the hook's path.
- *A controller's lights stay dark after a replug.* The LED cache is cleared on
  `[enabled, ports.output, map.name]`, and `onstatechange` only refreshes the ports and
  rewires the inputs. With the output on auto, a knocked cable or a power-cycled APC
  comes back dark and stays dark until each value changes. Clear the cache, and soft
  takeover, when an output connects. (§14's opening counts a MIDI replug as handled;
  that is the inputs.)
- *Continue starts the bar again.* `App.tsx` sends Start and Continue alike to
  `clockStart`, which resets the pulse count (`tempo.ts`), and Song Position Pointer
  (0xF2) is dropped by `parseMidi`: a DAW that continues mid-bar leaves the phase up to
  three quarters of a beat off. (Start and a clock dropout are 14e's.) 14-bit pairs and
  NRPN (CC 99/98/6/38) are not decoded either, so learn and auto-map bind the coarse
  byte or the parameter number.
- *The decks already know the bar* (*proposed*). Pioneer's Pro DJ Link (a CDJ's beat
  packets carry the beat within the bar and the tempo) and Denon's StageLinQ are on the
  network the show server already listens on for OSC and Art-Net. They give the true
  downbeat and tempo, which the ear gets wrong (half tempo above ~148, the one slow to
  come), and a track-load or on-air event that can stand in for fingerprinting at a new
  song. Ableton Link (§13 step 5) gives tempo and phase but not the track's bar one. A
  `server/prolink.js` beside `artnet.js`, into the beat clock as an outside source with
  14e's lead; "Decks" as a tempo source in the Sound sheet, on the phone too. The
  protocols are documented by their users, not their makers, which is the risk.

*Measure:* `npm run kicks` with a half-note intro (the tempo is 150 by the chorus);
`npm run timecode` through the hook with a SysEx full frame; a reconnected output is
sent every lit pad again; Continue after a Song Position of bar 3, beat 2 lands there.

### 14u. The desk and the shell

**Measured in headless Chromium at 1440×900 on 2026-09-28 where it says so; the rest
read in the code.**

- *The preview frame stops following the hole.* `usePreviewFrame.ts` observes
  `ref.current` once per `[enabled]`, and the desk stays up across Esc and a Perform ↔
  Design switch, so a new hole is never observed. Measured: after clean screen and Esc
  the frame stays at 0,0,1440,900 while the hole is at 288,104,824,706; a click on the
  preview lands on the hole, and every tool does nothing until a resize. After a switch,
  clean screen leaves the plate as the 824×706 box in a black window, wrong exactly when
  the laptop's screen is the show. A callback ref that observes what it is attached to.
- *Evolve wanders around the look before.* Only `applyPreset` and `updateSettings` move
  `driftAnchor` or drop `driftGlide` keys; `fadeSettingsTo` (Go), `revertLook` (Back),
  the sequencer's stages and `rideSetting` (a MIDI fader) do not. `driftLook` holds each
  dial within 20 % of its travel of the anchor, and skips a dial the anchor has at 0.
  Measured with the real `driftLook` over 100 drifts: 1,496 of 1,560 preset-to-preset
  Gos pull a dial more than a quarter of its travel off the new look, or switch on a
  dial it had off (stardust-collapse to poster-1969: nine switched on, ten pulled);
  re-anchored at the Go, none. A fader is also fought by a glide in flight. Re-anchor at
  the end of a look fade, and treat a ride as a hand's write.
- *⌘S never saves over the open look.* The keyboard's ⌘S opens the save sheet
  (`setShowSave(true)`) where the desk's button calls `saveLook()`, and it matches before
  the shifted branch, so ⇧⌘S never runs (`App.tsx`). Measured: the button wrote over
  "Mine"; ⌘S offered "Mine copy".
- *A sequence in the set list reads "missing" on every load.* The `cues` memo reads
  `sequencerRef.current`, which is assigned further down the same render, and its
  dependencies do not change on load. Go still plays it; the list says `slow-build · seq
  · missing`. Measured.
- *One storage read can stop the app starting.* `localStorage.getItem(
  'chromaglass-palette-lock')` in a `useState` initialiser has no `try`, where every
  read around it has one; with the site's storage blocked (Chrome with the site's
  cookies blocked, some private windows) it is the one throw, and Boot says "ChromaGlass
  could not start". Measured.
- *Two hands on the phone's clean screen bring the controls back.* The long press's
  `down` overwrites its timer without clearing it (`App.tsx`), so the first finger's
  700 ms can no longer be cancelled once a second finger lands.
- *Renders nobody needs* (beside 14f): `useImperativeHandle` in `LiquidVisualizer.tsx`
  has no dependencies, so its handle of about seventy methods is rebuilt on every App
  render (30 a second through a look fade); `<audio onTimeUpdate>` re-renders the App
  about four times a second while a song plays; `getLiveEngineStatus` is passed inline,
  so Settings' 1 s tick is re-armed by every App render and does not tick while the App
  renders fast.
- *After 14f's sound half (#211):* the cast's feed now listens to the ear itself, but
  `useSongChange` still has no dependency list, so the song-gap detector is sampled at
  the App's render rate, now about 11 a second (it was about 70). A tenth of a second
  may be fine enough for a gap between songs; if it is not, it wants the ear's
  `onReading`, as the cast's feed has.

*Measure:* `npm run desk` and `npm run layout` for the frame after Esc and after a
switch (the frame is the hole; a click on the preview reaches the plate); a node check
over `driftLook` for the 1,560 pairs, re-anchored; `npm run setlist` for the sequence's
name; `npm run phone` for two fingers; a load with storage blocked in `npm run panel`.

## 15. Every tool on every liquid

Asked 2026-09-27 ("Shouldn't blowing and finger also move around the ferrofluid?",
then "look at the liquid and tools interactions across all of them"). Read from the
code, with the velocity numbers measured in the lab. The whole table is in
`docs/tool-by-liquid.md`. What it found, by what a
performer would notice first:

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

### 15b. A tool's push lasts one step (why Blow and Finger barely move anything)

Every liquid rides one velocity field, which is held to `MAX_SPEED` 0.002
(`src/gpu/fluid.ts`, `decayVel`). The idle plate already runs at that limit. A
tool's velocity folds in before the step, carries the liquid once, and the clamp
then cuts it back to idle. The comments in `fingerDrag` and `blowAir` say the
projection removes the push. In the lab, the clamp accounts for about three times as
much as the projection does. Lab, 256², fingerDrag's own velocity dragged 30 cells
across a disc of dye and ferrofluid over 60 steps (centroid shift, cells):

| | dye | ferrofluid |
|---|---|---|
| left alone | 0.00 | 0.00 |
| today | 0.17 | 0.20 |
| clamp lifted | 0.56 | 0.63 |
| at the hand's own speed, no swirl, clamp on | 0.87 | 1.09 |

Only liquids with a hand-written carry actually move under a tool: the dye (Finger's
`carryDye`, Press's `squeezeOut`) and the oil (Finger's `carryMix`). A likely fix is
to feed a hand's velocity into the lasting current (`cur`, capped at 0.75 of a cell a
step, which remembers for about a hundred steps) instead of the clamped field. That
would carry every field alike. It changes how every tool feels, so it goes to the owner
first. Blow and Finger on the ferrofluid are 9n, in the ferrofluid thread, which has
these numbers.

### 15c. Blow's wind erases colour rather than pushing it

A moving Blow multiplies the dye under it by 0.8 every step, which clears it, and
its push is the one-step push of 15b. `npm run tools` checks "Blow clears dye from
under it", so the check asserts the eraser. Whether wind should push the colour
aside instead is a question for the owner, taken with 15b.

### 15d. Press moves the colour out of an oil body but leaves the oil, and leaves the ferrofluid

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

*Open:* **the ferrofluid.** Waits on 9n (Blow and Finger moving the ferrofluid, the
ferrofluid thread), which builds on `phaseCarry`'s radial mode; a press wants a flat
take out to the palm's rim on it, as the oil's has.

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

### 15e. The liquids' own forces are measured only on a stand-in plate

Soap, milk, silicone and glycerine push the plate through the same clamped velocity
(`liquidPhase.apply`). `npm run liquids` measures them on a 96² stand-in, never on
the GPU solver, so whether glycerine "crawls" on the real plate is unmeasured. Also
minor, in `performGesture`: a remote Finger is half as strong as the mouse's, and a
remote Blow never makes a straw bubble.


### 15f. The Comb: marbling's rake, as a tool (proposed 2026-09-28)

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

## 16. Many plates: each projector its own source (rig-plan R1)

Asked for on 2026-09-27 ("Let's build multi-plate next"), after the Mixer's steps 1–5.
`docs/rig-plan.md` has the why (a light show was several projectors, each its own
source, beams adding on the screen); this is the running order.

**What there is today** (read from the code, 2026-09-27). Two solvers at most:
`layerCount` is clamped to 1..2 (`LiquidVisualizer.tsx`, the layer effect), one
`WebGPUFluid` per layer, the front plate `fluidsRef[0]` and the back plate
`fluidsRef[1]`, drawn together in one plate pass. The two share one look: each frame's
settings fold into `patch.global` for the picture and `patch.layer(i)` for each solver
(`lib/sceneMap.ts`), and `patch.layer(i)` differs from the global only by a scene
mapping aimed at that layer. The back plate is otherwise the front's twin, turned the
other way, slowed by Background Loop and thrown by Layer Scale Variety. Every
projector (`Surface` in `lib/outputConfig.ts`, up to sixteen) samples the one finished
frame (`gpu/output.ts` binds one `scene` texture), blended over, not added. The grid is
one size for every layer (`resolveSimResolution` from the quality ladder,
`lib/platform.ts`), and the plate's bind group and shader are written for two layers
(`gpu/plate.ts`, `wgsl/plate.ts`'s one "Layer 1" block). The lab runs one solver.

**The decision rig-plan leaves open, taken here as the default:** up to **four**
plates, and with three or four each runs one rung of the ladder below the grid a
single plate gets (512 becomes 384 on a local GPU), so four plates cost about what two
do now. The owner can say otherwise; the ladder is one table.

Each step ships its phone version in the same PR (the rule) and one PR each:

- **16a · The back plate gets its own look.** A look can be sent to the back plate
  alone ("Go to Back Plate"): the solver's own settings and the colours it pours
  become the back plate's (`patch.layer(1)` over a per-plate look), while how the
  plate is drawn and lit stays shared. The desk's cue list and the phone's looks sheet
  each get the second Go; the Mixer's back row names the look it is on. Check: a node
  harness on the fold (each solver steps with its own look's settings, the picture's
  settings stay the front's) and the lab rendering two real solvers from two looks
  (the lab holds one solver today). The Mac judges the pair.
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
  Found while building it, not done:
  - *A source has no post effects and no closeup camera.* The wall's chain (bloom,
    the photographic presets' lens) runs once, on the wall; a source is the plate as
    the display pass draws it. Running the chain per source doubles its cost; worth
    it only if a rig asks.
  - *The logo stays up in a blackout* on the wall and on the front plate's projector:
    it is laid over the dimmer (`finishLight`), as it always was on the wall.
  - *Every network display draws every source its surfaces ask for*, since the cast
    state carries the output config and a receiver runs this same frame: a receiver on
    a weak GPU pays for the sources a laptop's projectors asked for. A receiver could
    be told which surfaces are its own.
  - *The remote cannot pick a source*, only the laptop and the phone's own Settings.
  - *Found on this PR's first Mac run:* `wall` §7c was measuring a moment of the plate.
    On Classic the back plate is laid empty (`layPlate` seeds only the front), so the
    back source and its reference were both black and the front source was the wall to
    0.001; and with no film loaded the film alone was black. It now runs on Fillmore
    East (its back plate laid with its own wash) with the browser's fake camera as the
    film, and asks that a film is playing before it measures. The same run's "every
    refresh's own timestamp was believed" is the Mac stamping refreshes up to 2.4 ms
    ahead; the draw gate's fix from #218 is ported here (it no-ops once #218 lands).
  - *What a source costs is not measured yet.* `wall` times each source's pass
    (`plate front`, `plate back`, `plate film` against `plate`) where the GPU has
    timestamp queries, and the Mac runner's has none: #226's green run printed "skip
    each source's cost". Each is the whole display pass again at the canvas's size.
    It needs reading on the owner's Mac (`chromaglassDebug()`, docs/judging.md §21)
    before 16d (four plates), which is where a budget has to be.
- **16c · Beams add, and the seam goes.** A surface can add instead of lay over (R3),
  and two feathered edges that overlap sum to one rather than to a bright seam.
  Check: `wall` reads the overlap's brightness against each beam's.
- **16d · Up to four plates.** `layerCount` to four, the plate's bind group and shader
  from two layers to N, the ladder's rung per plate as above, the governor told how
  many plates it is carrying. Check: `startup` and the frame time on the Mac with four
  (no stop on the opening, no pipeline built on a frame), and the lab with four.
- **16e · A row per plate in the Mixer** (the Mixer's step 6): each plate its own row,
  level and grade, reached from the desk, Settings, the phone and the remote.

Not in this batch: R4 (placing a projector by its centre, zoom and turn) and R5 (a rig
as a document the cue list points at). Slides as a source wait on `docs/slide-plan.md`.


## 17. Hear the set ahead, from files

Not started. Came out of asking what a streaming service's API could add
(2026-09-27): the one idea worth having was the show knowing each song before it
plays, and it needs no service at all, only the files.

Live, the show can only react. A song map (sections, energy, pitch) is made by
recording the song's first play (`ListenRecorder` in `src/lib/songMap.ts`, from
`useMusicIntelligence.ts`) and is cached by ISRC for the next time, so the first
time a song is played at a gig, nothing is known ahead of the note that is sounding.
Only the film render reads a song ahead: `src/lib/songTrack.ts` decodes the whole
file and works out every frame's bands and kicks before drawing (§6).

The idea is that the live show does what the render does, for a whole set:

- **Load the set as files.** Drop a folder or a playlist of files (bought FLAC or
  MP3; store downloads such as Qobuz's carry no DRM) onto the desk, or the Mac app
  (§13). Each song is decoded and analysed before the show, through the same code
  the render uses, and its song map is ready before its first note.
- **The show plays the files itself**, so it knows which song is on and where in it,
  to the sample, with no fingerprint service (`fingerprint.ts`) and no guessing at the
  gap between songs (`songBoundary.ts`). Offline at the venue, which is §14h.
- **Anticipate, don't react.** With every kick and section known ahead, a song show
  (`songShows.ts`) can fire an action a bar or two *before* a drop or on the last
  beat of a song, not after it: start a pour ahead of the build, black on the last
  hit, pick the next look from what the next song will do.
- **From the files' own tags:** the ISRC, so per-song looks attach exactly
  (`songRef.ts`), with MusicBrainz for files that lack one; embedded cover art as a
  source of the song's dyes; ReplayGain (or a loudness measured during the analysis)
  so a quiet record and a loud master drive the plate the same amount without
  recalibrating (`audioCalibration.ts`).
- **When something else is the player** (a DJ, a phone), the show carries on as it
  does today, through the mic or the interface.

**Open questions:** how much a whole set's analysis costs up front (a ten-minute song
decodes to about 230 MB of float before it is cut down, `songMap.ts`), so it wants a
worker and one song at a time; and whether anticipation is a new *when* for song
shows ("n beats before section") or a new kind of action. The phone gets the set
list, the now-playing song and the song shows' next cue, the same as the desk.

**Not doing:** a streaming service's API for this. Qobuz's API terms (researched
2026-09-27) forbid earning anything around the service and indexing its catalogue,
and a consumer subscription is for personal listening, so a stream at a gig is
outside its terms whatever the app does. Files the performer owns carry none of that.

## 18. The physics under the look: where the plate imitates a result instead of simulating it

Asked 2026-09-28. The owner's standing rule is to build from the chemistry and physics
of the liquids, not from a picture of their result, and to name any shortcut kept for
speed. This section is the audit that rule asked for: every place found in the solver
(`src/gpu/wgsl/fluid.ts`), the plate's optics (`src/gpu/wgsl/plate.ts`) and the tools,
drops, bubbles and bottles (`LiquidVisualizer.tsx`, `src/lib/`) where the code paints
how a liquid looks instead of simulating what makes it look that way. Each item says
where the shortcut is, what the real phenomenon is, what simulating it would take, and
what it would cost at the 768² rung. The costs are estimates from the per-stage table in
`docs/webgpu-plan.md` (Classic, two layers, 768², 6.58 ms a step on the M4) and the
plate pass's 2.0 ms, not measurements. Every item is read from the code; nothing here
has been built or measured yet.

The owner asked for all of these in the plan and picked 18a, the thin-gap flow, to
build first (2026-09-28); it starts in its own thread.

Three threads already own a piece of this, and their items are ranked here rather than
written twice: Classic's fingering push (the "grates" thread; its PR adds the plan item
for real Saffman–Taylor fingering), the ferrofluid's pull and the dye between the domes
(9f), and Blow (15c, with 15b and 15g).

### The one finding under most of the rest

**The plate has no velocity that obeys physics and remembers.** `decayVel` multiplies
the velocity by `damping` (a per-step factor with no dt in it) and then clamps every
cell to `MAX_SPEED` 0.002 (`src/gpu/fluid.ts`, `src/gpu/wgsl/fluid.ts` `decayVel`).
`docs/evaluation-2026-09.md` measured 99.7% of dyed cells sitting at that cap. So what
carries the dye is the noise stirring added after the pressure solve (`forcesB`:
turbulence, spin, vibration, drip, smear, air) and the half-resolution lasting current
(`cur`), which was added beside the main field to get some memory back. The viscosity,
the velocity's own advection and the second projection (about 2.4 ms, a third of the
step) work on a field the clamp then throws away. That one decision is why a tool's push
lasts one step (15b), why every tool moves the colour by a hand-written carry (15g), why
a press or a pour pushes nothing that the projection does not delete (bubbles-plan H),
and why viscous fingering could not be shown when it was built (physics-plan "What is
not here": the closed plate balances every source with a uniform sink).

A plate of liquid between two glasses is a Hele-Shaw cell. Its depth-averaged flow obeys
ρ∂u/∂t = −∇p + f − (12μ/h²)u, with ∇·(hu) = −∂h/∂t plus any source. The drag time
ρh²/12μ is about 0.02 s for water in a 0.5 mm gap, about 2 s in a 5 mm one, and nothing
for glycerine. The plate's memory should come from the gap and the liquid's viscosity,
not from a clamp.

### Ranked

By what the show gains against what it costs, GPU time first, since the show must hold
its frame rate live. "Free" means no new passes or texture reads.

| # | Item | Gain | GPU cost | Needs |
|---|---|---|---|---|
| 18a | The plate is a Hele-Shaw cell | Large: tools move every liquid, thick liquids stop, fingering becomes possible | About −2 ms a step (a saving) | Retuning every look; the owner's feel call (15b) |
| 18b | The lamp shines through the dye | Large: gels colour the dye, overlaps darken, thin washes are pale | Free | A per-look choice of ground |
| 18c | A pour adds liquid | Large: a drop shoves the colour outward into rings | Free | Better with 18a's open rim |
| 18d | Each liquid has its real properties | Large: glycerine crawls, thin fingers into thick, alcohol punches holes | +0.5–0.7 ms, less CPU | 18a |
| 18e | Edges come from refraction | Moderate to large: one mechanism for every edge, and a focus ring to play | <0.1 ms | None |
| 18f | Heat comes from the lamp | Moderate: dark regions warm and move; the lamp's own cells | Nearly free | Better with 18a and 18e |
| 18g | Colour leaves by flushing, not fading | Moderate: the plate turns over like a real one; drying | ~0.3 ms | 18a, 18c |
| 18h | Dye spreads along the flow | Moderate: streaks where it moves, sharp where it is still | About equal to today | Better with 18a |
| 18i | Bubbles and beads live by physics, not timers | Moderate: less "sticker" behaviour | CPU only | The owner's call on pacing |
| 18j | Milky liquids scatter | Moderate for milk, paint and latex | Free to +0.4 ms | A freed binding |
| 18k | Smaller ones | Small | Free to small | See each |

### 18a. The plate is a Hele-Shaw cell (replaces the speed clamp)

- **Where:** `MAX_SPEED` and `damping` in `decayVel`; the lasting current
  (`currentForces`, `addCurrent`); the squeeze film's red-black sweeps and
  `squeezeVelBuf`; the depth multiply in `addCurrent`.
- **The shortcuts it removes:**
  - **The clamp** sets every speed on the plate (above).
  - **The squeeze film's pressure solve** does almost nothing. Five red-black sweeps
    solve ∇²p = 12μ ḣ/h³, and `squeezeVelBuf` adds −(h²/12μ)∇p to the velocity. That
    is a pure gradient, which the next projection deletes, as the kernel's own comment
    says ("pressing seventy-five times harder moved the same 1%"). The sweeps and the
    add are most of the squeeze stage, which is the step's most expensive at 1.13 ms.
    What actually presses is the −ḣ/h source in `divergence`. The operator is also the
    wrong one: the Reynolds equation is ∇·(h³∇p) = 12μ ḣ, not ∇²p with h³ moved into
    the source.
  - **Depth as a capped multiply** on the projected flow ((h²/h₀²)^k, capped at 1),
    which makes a divergence-free field divergent. That is why it ships off.
- **What it takes:**
  - One velocity field with implicit drag, u ← (u + dt(f − ∇p)/ρ)/(1 + dt·12ν/h²).
  - A variable-coefficient projection ∇·(M∇p) = ∇·(Mf) + ∂h/∂t, with mobility
    M = h³/12μ(x). The multigrid takes face coefficients (harmonic means); a version
    was built once (physics-plan).
  - **An open rim:** cells at the dish's edge held at p = 0, so liquid can enter and
    leave there instead of every source being balanced by a uniform sink. This is what
    viscous fingering was missing.
  - At these Reynolds numbers the velocity's self-advection and the second projection
    can go.
  - A tool then acts on the flow and the flow carries every field. Blow is a surface
    shear stress, a Finger is a solid in the layer (Brinkman penalisation: the hand's
    velocity imposed inside its disc), a Press is ∂h/∂t. The hand-written carries
    (`carryDye`, `carryMix`, `fingerCarry`, `pressDye`, `pressMix`, `blowDye`,
    `blowOil`, `blowCarry`) can then be retired one at a time, each against its
    existing check (`finger`, `wind`, `pressoil`, `ferrohands`).
- **Cost:** removing the second projection (0.82), the velocity advection (0.69), most
  of the viscosity (0.91), the current (0.41) and the squeeze sweeps saves about 3 ms.
  The variable-coefficient solve and its coefficient pass add about 1 ms. So roughly
  2 ms a step are saved. The collocated grid's patches (`dampGrid`, the Rhie–Chow
  faces, `mixRelax`) are worth reconsidering in the same change: a staggered grid
  removes the checkerboard they exist for.
- **What is lost:** eddies. A thin plate has no turbulence, so the swirl has to come
  from hands, heat (18f), tilt and rotation. The noise stirring should stay as a
  declared dial ("hand stir"), fed in before the projection so that it too lasts
  through the drag time, not added after it.
- **Subsumes:** 15b (a tool's push lasts one step), the force half of 15g (air's shear
  and the jet's dimple on the film), bubbles-plan G (press and lift as different
  strokes: the lift's Saffman–Taylor fingers grow from this instead of from
  `squish.ts`'s hashed spokes, whose count is 8 + seed % 9) and roadmap Stage 1 F
  (depth). It is the prerequisite for the grates thread's Saffman–Taylor item.
- **Ships as:** a solver mode behind a setting, off by default, judged look by look on
  the Mac, because it changes how every look moves and every tool feels. Measured by
  a new lab check (a press's ring radius against the volume displaced; a drag's
  displacement against the drag time ρh²/12μ; dye conserved with the carries off).

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
- **Left for later PRs, each its own thread (the shortcuts this one keeps, named):**
  - **18a-2, forces that are forces.** The look's stirring (`forcesB`: turbulence,
    spin, tension, drip, air) and every other force are still the old per-step
    velocities, read as terminal speeds at the rest gap. Each should become a force
    with its own physics (the stirring a declared "hand stir" dial), and the grates
    thread's Saffman–Taylor item needs this first.
  - **18a-3, tools as solids.** A hand's push is imposed along its direction (a
    penalised solid in the limit where the solid wins), not a disc moving at the hand's
    velocity (Brinkman), and the hand-written carries (`carryDye`, `carryMix`,
    `fingerCarry`, `pressDye`, `pressMix`, `blowDye`, `blowOil`, `blowCarry`) still run
    on top of the flow, so with Thin Gap on the colour is moved twice. Retire them one
    at a time against `finger`, `wind`, `pressoil`, `ferrohands`, `tools`.
  - **18a-4, the current into the field.** The lasting current (`cur`) is fed into the
    thin solve as a force, but it still has its own solver on the M grid; its forces
    (rock, twist, buoyancy, centre gravity) belong in the main field, and then the
    current's solver and its 0.4 ms go.
  - **18a-5, the press over its own time.** `squish` can lay a press's dent in one
    step, so the displaced volume leaves in one step, faster than the dye's face
    fluxes may carry it (0.45 of a cell a step). The app's Press lays its dent a step
    at a time (`lib/squish.ts`), and `npm run thingap` presses over ten steps; the
    glass should close over the press's own time wherever a dent is laid, and
    `gapMemory` then has no job in a thin gap.
  - **18a-6, inertia for water.** The velocity's self-advection is dropped. The reduced
    Reynolds number Re·h/L is under 0.1 for oils and near 2 for water in the plate's
    6 mm middle, so water in a deep gap has more inertia than this keeps. Measure it on
    Water looks and bring back a cheap advection if it shows.
  - **18a-7, the rim follows the dish.** The open rim is the plate's inscribed circle;
    with Dish Spread (two dishes) or a round-dish vignette each dish has its own edge,
    and the solver does not know it. And the inscribed circle touches the square's four
    sides, where the box's wall, not the open rim, meets the liquid: a flow across the
    plate is stopped at those four points (a lab probe of a uniform push read the speed
    at the wall down to 0.54 of the rest and a sideways jet of 1.9 beside it), and the
    pressure that takes it out reaches the middle for two steps (`npm run thingap`
    prints that first step). The rim should sit a cell or two inside the square, or the
    cells outside it count as open too.
  - **18a-8, a staggered grid.** Cell velocities are rebuilt from the face fluxes,
    which leaves a small checkerboard at a floored dent's edge; the advections'
    Rhie–Chow faces are given c·P, exact only where the drag is even; and the face
    fluxes' upwinding squares off a ring under a fast radial flow (the pressed rings in
    the picture). A staggered grid takes all three, and `dampGrid`'s job.
  - **18a-9, the CPU engine.** Thin Gap is WebGPU only; the CPU fallback ignores it.
  - **18a-10, the in-plane viscosity.** The viscosity stage (0.91 ms) still runs with
    Thin Gap on. In a gap it is the Brinkman correction to the drag, of order h²/L²
    against it; measure whether any look shows it, and drop it for the time if not.
  - **18a-11, the cost measured.** The saving above is an estimate; measure the step
    with Thin Gap on and off on the Mac (`?debug`, docs/judging.md §19).

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

### 18c. A pour adds liquid, not only colour

- **Where:** the Dropper stamps dye with no volume. The Pour, the splash crown and
  the Splatter push with a radial velocity kick, which is curl-free, so the projection
  deletes it (bubbles-plan H's own rule). The splash fires at any energy above 0.02,
  with a random count of satellites.
- **The real phenomenon:** a landing drop is a volume source Q. Between glasses it
  drives a radial flow, u_r = Q/(2πrh), that shoves the colour already there outward
  into concentric rings (drop into drop). A crown splash needs K = We·Oh^−0.4 above
  about 2100, which for a 3 mm water drop means falling from about 20 cm or more. Below
  that a drop only merges and spreads. Whether an oil drop stays a lens or spreads to a
  film is set by the spreading coefficient S = γ_w − γ_o − γ_ow, which is negative for
  most oils.
- **What it takes:** a volume channel on the splat record, fed into `divergence`
  exactly as a growing bubble's rate already is. The splash is gated on K from
  `dropHeight`.
- **Cost:** free (one term in an existing pass).
- **Gain:** drops push the plate's colour into rings, and bubbles and beads get pushed
  by that real flow rather than by `disturb()` kicks. Works today against the uniform
  sink. It is better with 18a's open rim, and with 18d it gives radial fingering when a
  thin liquid is poured into a thick one.

### 18d. Each liquid has its real properties (replaces the property scalars)

- **Where:** `src/lib/liquidPhase.ts` and the bottles in `src/types.ts`. The viscosity
  is one global switch (`thick ? 1.5 : 0.5`).
- **The shortcuts:**
  - **Soap, milk, silicone and glycerine** are channels on the CPU at 192², read back a
    frame late, and each fades on a timer (soap 6 s, glycerine 22 s). A liquid does not
    evaporate as a property.
  - **Glycerine's "body"** is a drag against last frame's velocity, projected and then
    clamped.
  - **Soap's Marangoni force** is a pure gradient added before the projection, which
    deletes it. The clear disc people see comes from a dye multiply that destroys the
    colour. The GPU already moves soap correctly (`marangoniFlux`), so soap is modelled
    twice.
  - **Colour-difference "tension"** (`forcesB` `tension`, the Immiscibility dial) makes
    two dyes of different hue in the same water repel. Interfacial tension exists only
    between immiscible liquids; food dyes in water mix. Many looks are tuned on the
    cohesion this gives, so retiring it is a look change and the oil or silicone
    bottles have to take over the job.
  - **Milk** has `repel: 1`, but milk is a miscible emulsion.
  - **Alcohol** "rises through water". Nothing rises in a level dish. Alcohol's real
    effect is a strong Marangoni burst (σ about 22 against 72 mN/m) plus evaporation:
    the hole it punches in a film.
- **What it takes:**
  - Each bottle carries a viscosity, a surface tension (or its drop against water), a
    density and a refractive index.
  - One rgba32f species texture on the GPU, moved in flux form (the `mixAdvect`
    kernel exists), with no decay.
  - A mixture viscosity μ = μ_w^(1−c) μ_g^c (spanning about 1000×) feeds 18a's
    mobility. Density feeds the tilt's buoyancy. Soap and alcohol go into the GPU's
    surfactant field with a σ(Γ) law. Immiscible bottles get a Cahn–Hilliard phase
    each, as the oil has.
  - The CPU soap force, the dye multiply and the colour-difference tension are then
    deleted.
- **Cost:** about +0.5–0.7 ms on the GPU, less the CPU pass (1.5–3.5 ms of CPU at 192²).
- **Gain:** glycerine crawls because it is thick, a thin liquid fingers into a thick one
  (Saffman–Taylor, with 18a), alcohol blasts holes, and nothing silently disappears.
  Extends 15e, which found these forces measured only on a stand-in plate.

### 18e. Edges come from refraction (replaces the painted rims and highlights)

- **Where:** in `plate.ts`, `sobelGrad` and `gradNormal` turn the gradient of dye
  density into a "surface normal". That normal drives Lambert and Blinn–Phong shading
  (`applyLighting`), the dark rim and highlight of `meniscus()`, the bright line of
  `boundaryContrast` (set in 34 presets), `lacing`'s threads, and the camera pass's
  refraction offset. The oil phase is drawn with its own `|∇oil|·2.2` darkening.
- **The shortcut:** dye concentration is not a height, and there is no free surface
  between two glasses to shade. Only the drops and bubbles (the beads and the air
  field) get the real optics today: Snell refraction at the meniscus and the
  projector's aperture (`dropLens`, the `u*` law).
- **The real phenomenon:** light between two glasses bends where the optical path
  OPL = ∫n dz changes. n depends on the dye's concentration (Δn about 10⁻³–10⁻²), oil
  against water (1.47 against 1.333), temperature (about −10⁻⁴ per K) and the gap. A
  projector then shows two effects:
  - **Aperture loss:** darkness wherever the deflection is steeper than the lens can
    take in. This is the drops' `u*` law, applied everywhere.
  - **Shadowgraph:** at a defocus Δz, I ≈ I₀(1 − Δz·∇²OPL/n). This gives the bright
    and dark doublets at fronts (Becke lines), and caustics once the rays cross.
- **What it takes:** build n from the fields already bound (dye, oil, gap, heat), and
  compute OPL = n·h with its gradient and Laplacian in the derive pass. That pass runs
  once a frame and has a spare channel. The display pass applies the aperture and the
  defocus term. The projector's focus becomes a real control a performer can ride.
  - The aperture's hard threshold becomes the overlap of the condenser's illumination
    disc with the lens pupil. The comment on `DROP_NA` (raised from the physical 0.05–
    0.1 because it "drew black doughnuts") and the 0.85 and 0.9 floors are that
    overlap, guessed.
  - The solver's oil and the beads then look like the same material.
  - The painted highlights (the Blinn–Phong spec, `meniscus`'s spec, the macro's "wet
    highlight", `microDrops`' dots) go from projected looks: a plate lit from below
    sends no reflection to the wall. They stay in the camera and closeup looks.
  - True folded caustics would need a scatter pass. The 16-binding limit is reached,
    so that is later.
- **Cost:** under 0.1 ms for the gather version.
- **Gain:** one mechanism replaces five painted ones, and edges answer to focus, press
  and oil.
- **Risk:** real dye-into-water fronts are faint (Δn is small), so the plate may lose
  the bright boundary line its looks are tuned on. Keep a gain on it, named as a gain.
  Research item 4 (`/mnt/project-files/drops/research/bubbles-and-drops.md`) is this;
  it was not in the plan.

### 18f. Heat comes from the lamp, and a level plate has no "up"

- **Where:** `currentForces` pushes heat along `S.up` (the gravity direction, whatever
  `plateUpright` says), saturated by tanh(20T). Heat is injected in spots by pours and
  the music (`addTemp`), and `heatDecay` is per step. Centre gravity and rock use
  tanh(dye − mean) and are not tied to the dome the gap actually has. The oil has no
  density, so it never rises on a tilt. `mixForce` already gets this right: gravity
  only in proportion to how upright the plate is. The noise stirring (`forcesB`) is
  what moves an untouched plate, with no physical source.
- **The real phenomenon:**
  - On a level plate gravity points through the glass, so in-plane buoyancy is zero.
  - The lamp heats the dish through the dye's absorption, so dark regions warm. A hot
    spot drives liquid outward along the surface (thermocapillary flow: dσ/dT about
    −0.15 mN/m per K for water, −0.06 for oils). It thins the film into holes, which is
    the European school's burning away. From below, the lamp makes Bénard–Marangoni
    cells once the Marangoni number passes about 80.
  - Water's viscosity falls about 2% per K.
  - Downhill on a dished glass is ∇h from the gap's dome.
- **What it takes:**
  - A heat source ∝ lamp intensity × absorbed fraction (from 18b), and Newton cooling
    per second.
  - ∇T fed into the existing `marangoniFlux` as σ(Γ, T).
  - Buoyancy gated on `upright`, with the tanh removed. Oil gets a density below
    water's.
  - Viscosity falling with temperature, into 18a's mobility.
  - Heat written to the velocity texture's spare channel in `packVel` (it is thrown
    away there today) so 18e's shadowgraph shows the convection as shimmer.
- **Cost:** a few operations in existing passes, and four taps in the plate.
- **Gain:** an untouched plate breathes where it is dark and hot, speeds up with the
  Dimmer, and shows the lamp's own cells. It is the mechanism slide-plan S2 is waiting
  on (heat with a strength). Turbulence stays as the declared stir dial.

### 18g. Colour leaves by flushing, not by fading

- **Where:** the dye-budget regulator and "evaporation" (`LiquidVisualizer.tsx`,
  applied in `decayDye`), `capDye`, the `airExclude` multiply, a still bubble's
  `standing` pump, and soap's dye multiply.
- **The shortcuts:** dye over the budget is removed everywhere, in proportion to the
  square of the overage. "Evaporation" removes dye, not water. A bubble destroys the
  dye under it by a multiply, a CPU rim deposit puts some back, and a bubble sitting
  still keeps pumping liquid out of itself every step.
- **The real phenomenon:**
  - Nothing removes dye from a sealed plate. Old colour leaves a real plate by being
    flushed out of the open rim as new liquid goes in (18c).
  - Evaporation removes solvent: the concentration rises and the dye is left in a
    coffee ring.
  - A bubble is a volume with no liquid, so the dye is excluded by volume fraction.
- **What it takes:** 18a's open rim as the outflow, pours as volume (18c), the dye
  carried as concentration × liquid fraction with air as a phase, and evaporation
  acting on a carrier-thickness field (bubbles-plan F's wet carrier). A safety cap
  stays, named as one.
- **Cost:** about 0.3 ms (one r16f texture and a flux pass).
- **Gain:** a show ages the way a real plate does. It turns over, and it can dry.

### 18h. Dye spreads along the flow (replaces isotropic diffusion and the conservation patch)

- **Where:** Jacobi dye diffusion with one constant for every colour (about 1000× the
  molecular rate where it is on); the MacCormack Jacobian clamp and neighbourhood cap
  (`fluid.ts` advection), which lose the excess; `sharpenDye`, retired (0 by default)
  but still in the step.
- **The real phenomenon:** molecular diffusion is negligible at this scale. The blur in
  a Hele-Shaw cell is Taylor–Aris dispersion along the flow,
  D_L ≈ D_m + h²|u|²/(210 D_m). Edges stay sharp where the liquid is still and streak
  where it moves.
- **What it takes:** the dye moved in flux form (`bodyAdvect` exists), and one or two
  explicit passes of dispersion with a tensor built from u⊗u. The Jacobian patch exists
  because the transport field is divergent (the noise after the projection and the
  depth multiply), so it can go with 18a.
- **Cost:** about the same as today's diffusion (1.3 ms where it runs), or 0.3–0.6 ms
  explicit.
- **Gain:** streaks along the flow, and conserved dye. Honest: a minmod flux carries
  fine threads a little softer than MacCormack, and the plate's detail table
  (`npm run detail`) has to hold.

### 18i. Bubbles and beads live by physics, not timers

- **Bubbles** (`src/lib/bubbles.ts`) live 9–23 s and pop at the end. The soap film's
  colour runs on age over life. A pop makes 2–3 random daughters, merges are random
  (`rng < dt·0.12`), pairs are pulled together, and the drift has a random wander at a
  fixed 1.4× the flow. A bubble trapped between glasses is an air pancake with no
  draining film, so it does not pop on a timer. It ends at the rim, by dissolving (the
  Ostwald ripening already there), by merging when the film between two drains, or
  when a drop breaks it. With no free surface there is no pull between bubbles. A
  bubble runs at about twice the flow, less a film correction.
  The cheap version drops the timed pops, daughters and pull, drives merges by drainage
  time and sets speed from the capillary number. The full one (air as a phase with
  Laplace pressure in 18a's solve) lets bubbles finger and split. The Straw's finger
  count is random (`lobes: 8 + rng(7)`); the real count follows the finger wavelength
  λ ≈ πb/√Ca.
- **Beads** (`src/lib/beads.ts`) are a carpet of particles born where a noise patch
  allows, coloured from the look's palette, moving at a fixed 0.8× the flow with
  jitter, merging at random. Nothing in the file knows about Oil Bodies. Real beads are
  oil that broke up where threads pinched off (Rayleigh–Plateau), carrying the colour
  they were poured with, and moving at about 2U/(1 + λ) for a viscosity ratio λ. What it
  takes: beads handed down from the Cahn–Hilliard oil where it pinches, coloured from
  the dye at birth, with speed from the bottle's λ.
- **Cost:** CPU, plus a readback of the oil field for the beads.
- **The owner's call:** timed pops also pace a show (`lifeScale`), and the bead carpet is
  a look in its own right, so both stay available as looks.

### 18j. Milky liquids scatter

- **Where:** everything in the plate is a pure absorber. `colourBody` pushes opacity
  and saturation up to imitate a body of colour, `granulation` modulates alpha with
  noise, and the Liesegang precipitate is a lerp.
- **The real phenomenon:** pigment and fat droplets scatter light (Mie), handled as
  two-flux Kubelka–Munk. With a projector's small aperture almost all scattered light
  misses the lens, so a milky liquid throws dark or grey with a soft forward halo. It
  does not throw white. The "solid reds on milk" in the references are a reflected-light
  look.
- **What it takes:** a scattering coefficient per bottle (18d) and a scatter channel in
  a repacked binding (the dye and `view0` are full). Extinction K + S·(the share the
  aperture loses) in 18b's exponent, with an optional small blur for the halo.
- **Cost:** free in the shader; +0.2–0.4 ms with the halo; the binding work.
- **Gain:** milk, paint and latex look different from ink. This replaces §4's "milk's
  opacity still owed" with its physics.

### 18k. Smaller ones

- **Thin-film colour:** the film's thickness is the dye's opacity ×16 plus drifting
  noise, through a cosine rainbow at 85%. The physical Airy table (`filmTable.ts`,
  `filmPhysics`) exists and is 0 in every preset. Real film colour in transmission is
  faint (0–8%), so a strong rainbow is a look and should be named one. The honest
  version is a transported film-thickness field driven by the soap. Cost: about 0.2 ms.
- **Linear light:** everything is composited in sRGB-encoded values. The six-band
  spectral sums, every mix, screen and add, the camera's blur and its bloom are biased
  by that. Decoding at the inputs and encoding in the finish is free, but it moves every
  look a few per cent against the "same picture to the bit" gates, so it goes with a
  re-baseline.
- **Stacked dishes multiply, beams add:** layers combine by "screen" in gamma space.
  Two dishes in one beam multiply their transmittances, and two projectors on one wall
  add in linear light. Free once linear; rig-plan R3 covers the projector half.
- **Chemistry sits still under the stir:** Gray–Scott runs on a static 192² CPU grid
  that the flow does not carry, and soap "breaks down" on a 10 s timer. The reactants
  should be moved with the flow (one flux pass, about 0.1 ms), and soap should be left
  to dilution. BZ (the Oregonator) and Liesegang (Keller–Rubinow) are real models.
- **Spray and Splatter:** random stamps with an outward fling. Droplets land vertically,
  so the fling has no physical cause. Each droplet should be a small volume source (18c)
  with log-normal sizes (`dropRadius`).
- **The ferrofluid's spikes are placed** on a fixed hexagonal lattice
  (`src/gpu/wgsl/spikes.ts`) rather than emerging from the Rosensweig instability.
  Noted for the ferrofluid thread (9f onward), not audited further here.

### Kept, named as dials or looks

These are not physics and do not pretend to be: vorticity confinement (declared "not
physics a thin film has", off by default), the drift and room stir, the camera and
closeup looks' lens effects (depth of field, bloom, chromatic aberration), film stock,
the corner-pin grade, the lamp's hot spot and warmth, Roy's Ben-Day dots, and the
kaleidoscope. The noise stirring stays as a stir dial once 18a gives the plate its own
motion. The numerical patches of the collocated grid (`dampGrid`, the Rhie–Chow faces,
`mixRelax`) are numerics, not faked physics, and are worth reconsidering with 18a.

### Already physical

The multigrid projection. The gap field, with the press as a −ḣ/h source. The oil's
Cahn–Hilliard phase with a curvature capillary force, moved in flux form and conserved
exactly. Oil Bodies' partition of the colour. Marangoni flow as conservative surface
transport. Buoyancy in `mixForce` only when the plate stands up. The dye stored as
per-channel absorbance. Acid and base as signed equivalents. BZ and Liesegang. The
ferrofluid's pull as ∇|B|² with Langevin saturation, and the Ohta–Kawasaki labyrinth.
The drops' and bubbles' aperture optics, shapes set by the gap, Paterson relaxation and
Laplace-arc walls. The Airy thin-film table.

## 19. The checks, the build and the plan itself

Found 2026-09-28 by reading `.github/workflows/`, `scripts/` and the build, and by
reading 14 recent `Checks` runs and 96 `gallery.yml` runs through the Actions API.
Nothing is built. The first two cost the most: they are much of why a deploy took 37 to
77 minutes on 2026-09-27. (Numbered 19 because 16 and 18 are in flight, in #204 and
#207.)

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

### 19b. Measure is near its timeout, and its first red hides the rest

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

- `crash.mjs` waits 20 s for the GPU to draw, with `.catch(() => false)`; if it does
  not, the screenshot, loss, recovery, stall and fatal checks print `skip`, and the exit
  counts only FAILs. On a Mac runner that comes up with no adapter (§0 records one, on
  #189's deploy) the tools shard is green having tested none of them. `PHONE_GPU`,
  `SQUEEZE_GPU` and the `bands` rule under `CI` turn such a skip into a FAIL;
  `CRASH_GPU=1` on the shard would (`docs/crash-plan.md`).
- Thirty scripts in `package.json` run in no workflow. Most are hunts, benchmarks or
  tools for a hand, which is right. Four are not: `shelf` (CLAUDE.md asks for it on
  every sound change, and it is the only check on `plateDrone` and on the music's
  CORS), `sw` (the service worker's black-screen guard, and 14h's measure), `bubbles`,
  and `songs` (pure node, 15 checks in 0.05 s). `README.md` says every push to main runs
  its ten harnesses; `detail` is in no workflow.
- `scripts/check.mjs` finds the Measure steps by their `npm run` lines, so it leaves out
  `remotemix`, which Measure runs as `node … scripts/remotemix.mjs`.
- No harness reaches `songMap` and its worker, `plateDrone`, `controllerSurface`,
  `evolution`, `fingerprint`, `lyrics`, `musicDb`, `castProtocol` or `videoSense`
  (followed through every harness's imports with esbuild's metafile), and none opens
  `?cast`, so `CastDisplay` has no check (S15 in `docs/stability-plan.md` needs one).

*Fix:* `CRASH_GPU=1`; `songs` into Measure; `shelf`, `sw` and `bubbles` on a Mac shard,
or written into CLAUDE.md as by hand; `check.mjs` reading `scripts/*.mjs` paths as well
as `npm run` names. Each new check held red by the `check-skeptic`.

### 19d. The build and what it ships

- The main route loads about 527 KB of script gzipped (1.68 MB raw): the App's chunk
  236 KB, the engine's 186, React's 66. Only the routes are lazy (`main.tsx`: the App,
  the remote, the cast). `motion` is 42 KB of it, for 53 simple uses in six components;
  the phone's stage, the guide, the recorder, the MIDI panel and controller surface, the
  designer and Settings could each load when first opened. Do it after 14h's precache,
  since every lazy chunk is one more file that can be missing at a venue with no
  internet.
- No source maps are built, and the engine's chunk is named after its first module,
  `castProtocol-*.js`: a crash report's `App-*.js:1:NNNNN` cannot be read back to the
  code, and a GPU crash reads as a fault in "castProtocol" (`docs/crash-plan.md`).
- No workflow sets `permissions:`, so every job runs with the repository's default token
  scope, which `actions/checkout` leaves in `.git/config` while a PR's own scripts run;
  `FirebaseExtended/action-hosting-deploy@v0` is a movable tag handed the Hosting
  service account. Pull requests from forks get no secrets (`pull_request`, not
  `pull_request_target`), which is right.
- `package.json` has no `engines` where the harnesses need Node 22.6 or later (type
  stripping), and `README.md` says 18. `autoprefixer` is unused (no PostCSS config, and
  Tailwind 4 prefixes for itself); `vite`, `@vitejs/plugin-react` and
  `@tailwindcss/vite` are build tools listed as dependencies; several are a major
  version behind (vite, TypeScript, the React plugin, lucide).
- The Geist font's `@import` is dropped by the build; that is in #207, with 14h's fonts.

*Fix:* `sourcemap: 'hidden'`, the maps kept as a deploy artifact and not served, and
`manualChunks` naming the engine `engine`; `permissions: contents: read` at the top of
every workflow, and the Firebase action pinned to a commit; `engines` and the README;
the dependencies moved or dropped. *Measure:* the built chunks' names, and a report's
frame read back through its map by the `crash-triage` skill.

### 19e. The harnesses as code

Shared helpers exist and are used (`chromium.mjs` by 54 scripts, and `lab`, `frame`,
`judge`, `layoutProbe`, `media-read`), but 80 scripts define their own `check()`, 46
start their own `vite preview`, 40 wait a fixed two to four seconds for a server rather
than asking it, and 12 copy the same port probe. Default ports collide: 4351 is four
scripts' default (`bottles`, `moving`, `render-app` and `mirror.mjs`), 4331 three
(`crash`, `ears`, `stages`) and 4326 three (`fx`, `shots`, `sw`), which matters when a
session runs two at once. On the Mac shards seven checks called through `npm run`
(`webgpu`, `qa`, `fx`, `magnet`, `depth`, `wall`, `startup`) build again after the
shard's own build, about 6 s each; in Measure `layout`, `phone` and `applink` each build,
while `remotemix` depends without saying so on an earlier step having built `dist/`.
`dc.mjs` at the root and `scripts/_diag.mjs` are wired to nothing, and `dc.mjs`
hard-codes `/opt/pw-browsers/chromium`, which `chromium.mjs` exists to avoid.
`actionlint`, which CLAUDE.md asks for on a workflow change, is in no image and no job.

*Fix:* a `scripts/harness.mjs` with `serve()` (port 0, polled until it answers) and
`check()`/`summary()`, taken up by new scripts first; the shards calling scripts
directly, as `checks.yml` already does for some; the strays deleted or wired;
`actionlint` in Measure.

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
- The Mac checks that went red once on trees that did not touch them are written in
  both §0 and §11 (the Finger's "adds none", the mirror's "nowhere else", `startup`'s
  3.52 s): one list would say which are still open.
- `docs/roadmap.md` is headed "Updated 2026-09-20", lists §3's drops as in flight
  (shipped, #163), the rig as not begun with R7 to come (R7 is §11, shipped), and Stage
  1's "the press and the lift" as open (§10 step 4, #185).
- `docs/judging.md` has two §10s and two §16s; §12 and CLAUDE.md cite §16 for the
  iPhone, and 9i cites §16 for the Magnet's fingers.
- `docs/webgpu-plan.md` counts about 101 dispatches a step and `docs/evaluation-2026-09.md`
  24 Jacobi iterations; the multigrid's step is 440 to 530 (`docs/webgpu-plan.md` H2c).
- `README.md` still asks for the laptop window to be kept visible "since the browser
  stops drawing a hidden window"; the projector window drives the frames now, and the
  ear hears behind it (14a).

*Fix:* one pass over each in a docs-only PR, at a moment when no other session has these
lines open (#209 has "What comes next" and the operating rules open today).
