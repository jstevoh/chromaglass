# 9. Ferrofluid after the references: what shipped

How §9's shipped items were found, built and measured. The open work is in
[`docs/plan/09-ferrofluid.md`](../plan/09-ferrofluid.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

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

## Third pass (moved 2026-10-29, 19m)

### 9. Ferrofluid after the references

- **9t. The ferrofluid stands up as a layer that keeps its volume** (**shipped**).
  The plate kept the ferrofluid as one number a cell, held at or under full: a plan
  view that keeps the liquid's area, so a pool under the Magnet could only be packed
  into domes (spikes.ts's lattice, wells in the separation, a pull eased to half) and
  84% of the plate within 0.08 of the magnet stayed black, where every reference has
  black domes with the colour between them. A real layer keeps its volume: a dome
  standing up takes its height out of the layer round it, and the gaps open by
  themselves. Now, round each magnet past the onset (the hand's, and the phone's other
  fingers), a patch of the plate's cells is stepped as a thin film of the Rosensweig
  instability (`src/gpu/standing.ts`, `wgsl/standing.ts`): tension, gravity, the
  field's lift as a half-Laplacian through an FFT, the glass's wetting, a cell past
  full a dome that much taller. The plate's own passes step aside under it (the
  separation, Cahn–Hilliard, the maze's flow and the magnet's pull), and the
  water's flow carries only the layer's mean there, the film its shape; its cap at
  full is raised to the top glass there. The plate draws each dome from
  the layer's own slope, the white point on the top of each. In the lab on 384², a
  pool 0.12 in radius under the hand's Magnet: from 84% black to 47% within 0.08 of it, 13
  domes a median 0.032 apart (2π l_c is 0.04), none made or lost; flat under
  the onset; back to a pool when the field is turned down (`npm run standing`).
  `npm run spikes` moved to 384² and reads the domes the layer makes (28 within 0.12 of the hand, 16 with a white point on
  the top against 1.8 half a pitch off, 6/6). The
  plate's film beyond a domain's line reads the least of four points on the way out, not
  one four and a half cells off, which had landed in the next dome and drawn dark dashes
  on every dome's side facing it.
  Shortcuts, each still to replace:

- **9x. Picking the Magnet poured the hole itself; a magnet you size and play**
  (**shipped**). Reported by the owner (2026-10-03), on the build with 9s live:
  "Magnet still makes a giant black hole as soon as you pick it. That's not what I
  want. I just want a magnet that I can control the size of that I can interact
  with." The page is network-first in the service worker, so it was not a stale
  build: the pour was the hole. Picking the Magnet poured the look's ring
  (`phasePour`), 22% of the plate in black drops round the middle at Classic's Scale
  and 27% at Scale 0.8, where the drops run together across it (lab, 256²; the
  disc 0.12 round the middle 9% black, then 29%). Now picking it changes nothing on
  the plate. The first touch on a plate with no ferrofluid brings one pool under the
  hand (`magnetFor`), 0.09 of the plate in radius at the tool's own size, about 1%
  of the plate; the app turns Ferrofluid up so it is drawn and gives the look its
  magnet (`onMagnetInHand`), and the pool goes with the hand (lab: laid at 0.30 and
  dragged to 0.60, its centre ended at 0.58). **Magnet Size** (`magnetSize`, 0–1,
  0.5 the tool as it was; `lib/magnetSize.ts`) sets how big the hand's magnet is,
  held and set down: k = 0.5 to 2 times the size, the dipole k times deeper with k³
  the strength, which is a real magnet scaled (magnetostatics has no length of its
  own): the same field share over it, reaching k times as far (the pull is weaker
  than a scaled magnet's at a big Size; since 9v a magnet k times as wide at the same gap), so the spikes' patch and
  the pool it brings are k times as wide (lab: 0.3%, 1.1% and 4.6% of the plate at k
  0.5, 1 and 2). It is the performer's, kept across looks (`RIG_KEYS`) and never
  drifted, on the Settings sheet, the desks' Magnet options (right-click the Magnet)
  and the phone's Magnet panel (tap the Magnet twice), and MIDI-learnable. The
  governor's new solver gets the pool back where the magnet is, not the look's ring,
  and nothing at all while the Magnet is picked and untouched.
  The tools' options (right-click a tool) opened beneath the plate on the Design desk,
  only their bottom edge showing under the canvas; they go to the page's body now.
  `npm run magnet` asks that picking pours nothing and puts no magnet under the
  plate, nine seconds on too; that the first touch brings one pool under the hand
  and draws it; that a drag carries it at least half way to where the hand ends;
  that Size reaches the solver's step as height ×k and strength ×k³; and, on its own
  page with the governor held at 512² (`rung=2`) and stepped down on purpose
  (`stepDownFrames`) twice, that a new grid
  lays nothing on an untouched plate and only the hand's pool, once, at the magnet
  moved from where the pool was poured (another PR's run caught main's ring laid again by the governor, lays 1 → 2,
  grid 384² → 256²). `npm run
  phone` asks that Size is under the Magnet's Amount and moves the setting. The
  pool still reads as a black disc with domes round its rim, because the plate
  cannot open gaps between domes yet: that is 9t's standing-domes plate PR.

- **9v. The magnet as a real magnet, not a deepened dipole (shipped).** The
  solver's magnet was a point dipole, and Magnet Size (9x) sank it k times deeper
  with k³ the strength: a magnet scaled gap and all, its axis field the same at
  every Size, and with the liquid's saturation (`MAGNET_BSAT`) a number in the
  dipole's own units, a big one pulled less at the edge of its reach than the
  magnet it stood for. Now the magnet is a uniformly magnetised cylinder
  (`src/gpu/wgsl/magnetDisc.ts`): its field is Derby and Olbert's closed form in
  Bulirsch's elliptic integral, four rounds of an AGM, handed to a dipole of its
  volume past six to eight half-sizes. At the tool's own size it is a rod 0.05 of
  the plate in radius and twice as long (20 mm by 40 mm on the 20 cm dish), its
  face 0.06 above where the dipole stood (13.5 mm under the liquid held to the
  glass), so at the default its spikes reach where they did (0.157 of the plate
  out against 0.156, on its axis 0.952 of the hand's field against 0.954).
  Flatter shapes were tried first (a 32 by 16 mm disc, 24 by 24, a 20 by 30 mm
  rod): matched at the spikes' patch, their fields fell away faster past it,
  and `npm run fingers` lost its reach (the discs 8 to 5 on the 0.12 circle, the
  short rod 7 to 6 on the 0.09, under the check's 7; on Metal too). This rod's
  fingers are 10/8/9/5 on the four circles in 7 sectors, main's 12/7/8/3 in 6. Magnet Size sets the radius, k = 0.5 to 2 times it, the gap and
  strength untouched: a bigger magnet is stronger at the glass (on its axis 0.26,
  0.95, 2.22 at k 0.5, 1, 2, where the deepened dipole stayed at 0.95) and reaches
  further (spikes out to 0.050, 0.157, 0.339; the dipole's 0.078, 0.156, 0.312).
  The saturation is a field on the same scale (`MAGNET_BS`, spikes.ts):
  ψ = B²/(1 + B/Bs) with B the strength times the magnet's field, so a weaker
  magnet pulls the far liquid as its square; Ferro Maze's own magnet went 0.3 →
  0.45 and Ferro Paint's 0.5 → 0.6 to gather as they did. Both constants carry
  the old ones over at the hand's magnet, so `MAGNET_GAIN` and phaseMu's χ keep
  their tuning. The radius rides `GpuStepParams.magnetRadius` (`Sim.magRadius`,
  and the standing layer's `Film.size`); every shader including `SPIKES_WGSL` defines
  `magnetRadius()`. `npm run disc` (lab, Mac plate shard) runs the shader's own
  text against a Biot–Savart sum over the side current: within 0.0073% on and
  off the face and at the rim, 1.24% where it hands over to the dipole (the point
  dipole there 2.5%), 1.2% past it; at Size 0.9 the pull at the edge of its
  spikes is the real magnet's (1.000), where main's deepened dipole pulled 0.31
  of it; the plate's far shortcut (spikeAmp answers far points without the
  integrals) never drops a spike; every look's own magnet stays under the onset
  (Magnet Garden 0.148, Ferro Paint 0.099, Ferro Maze 0.023 against 0.18). In the
  lab on the rod: `spikes` 6/6 (outline 2.83, main 2.85), `fingers` 4/4. `npm run magnet` (Mac)
  now asks that Size makes the held and the set-down magnet k times as wide with
  its height and strength as they were. On the phone, Size is the same setting on
  the Magnet panel and the other fingers' magnets are the same magnet. A saved
  look with its own magnet at a low Strength pulls as its square now (0.3 pulls
  about a third as hard as it did). Judging §37.

## Fourth pass (moved 2026-10-29, 19m-2)

### 9. Ferrofluid after the references

#### 9b. Maze detail

- **9b. Maze detail**, shipped in #167. The maze's finger width is fixed by `MAZE_PERIOD` (0.045 of the
  plate) and comes out two to three times wider than the reference, and it coarsens
  over time. Maze Detail (0 to 1) divides the period by up to three; 0 is the maze as it
  was, bit for bit, and Ferro Maze uses 0.5. `npm run maze`: finger width 0.0296 at 0.5
  against 0.0431 at 0 (ratio 0.69). Whether it now matches the reference is for the
  Mac.

#### 9ab. Fingers thinner than the grid are drawn

- **9ab. Fingers thinner than the grid are drawn** (**shipped**). The plate drew the
  ferrofluid only past its half-full line, so a finger pulled out narrower than the
  solver's interface was not drawn at all. `npm run fingers` then passed or failed on the
  dye's shade under it, and went red on the deploy after #267 (4 at 0.12 against 7). With
  no line within four cells up the slope, the strand is now drawn by Beer–Lambert through
  the thickness its phase gives. Lab: 13/16/13/8 drawn against the field's 15/19/13/8
  (2 at 0.12 by the line before). Judging §41. Open: the maze's haze (9aa) is under half
  full too and is drawn by the same rule, so it reads browner until 9aa takes the leak out.

#### 9w. Carry the ferrofluid across a new solver

- **9w. Carry the ferrofluid across a new solver** (**shipped**). The dye was
  carried when the governor moved the grid; the phase was not, so the frame loop
  poured the look's ring onto every new solver while Ferrofluid was up: a pool
  dragged into a shape lost it, and ferrofluid poured by hand from the bottle (on
  Classic, say) came back as the look's ring, ferrofluid nobody poured. With the
  Magnet moving only what is on the plate (9y), a pool lost that way left it
  nothing to hold. The oil, soap and acidity of the mix (Oil Bodies' bodies
  among them) and the BZ and Liesegang reactions were lost the same way, with
  nothing poured back. Now the old solver copies those fields on the GPU before
  it goes (`handOver` in `gpu/fluid.ts`), and the new one lays them onto its
  grid (`takeOver`): the ferrofluid and the mix by an area-weighted mean
  (`carryArea`, counted in integers so every overlap is exact), which keeps the
  amount to the rounding, and the reactions copied as they were. The frame loop
  lays the look's ferrofluid only on a solver that opened on no carry (the first,
  or one after a lost device). `npm run regrid` (lab, 6/6 in a cloud session at
  384² and 256²): 5.288% of the plate in → 5.288% on the new grid, 0.0 ppm off,
  each cell (ferrofluid and mix) within 1.5e-7 of the area mean worked out in JavaScript, the black
  shared 97.4% (98.2% back up), the middle moved 0.00 cell; the same move with
  nothing handed over leaves 0.000% (main's behaviour); oil 3.020% → 3.020%, soap
  0.690% → 0.690%, acid 0.396% → 0.396%, Oil Bodies' tally the same; BZ and the
  gel identical value for value; a carry from another device refused. On the
  Mac, `npm run magnet` check 8 asks it of the app: the Ferrofluid bottle on
  Classic, two pools poured, the governor stepped down from 512²: no lay, the
  same amount, the pools where they were. Not carried: Oil Bodies' share of the
  dye (it starts empty and is handed back the colour inside each body within a
  few steps), the glass's press (a press held through a move starts again from
  the rest gap), the particles (H1, which re-seed from the dye), and the clear
  film of 20b (#259, which landed while this was in review: its field is
  dropped at a move as the ferrofluid was, to be carried the same way). Not checked
  anywhere yet: that the app keeps the carry until the new solver's first
  readback, so an out-of-memory retry after a climb gets it, and that after a
  lost device the app's next solver refuses the old carry and lays the look's
  ferrofluid as before (the lab checks only a second device's refusal).
