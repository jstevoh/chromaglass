# 26. A reaction that prints: Turing stripes in black and white (proposed 2026-10-05): what shipped

How §26's shipped items were found, built and measured. The open work is in
[`docs/plan/26-turing-print.md`](../plan/26-turing-print.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 26. A reaction that prints: Turing stripes in black and white

#### 26a. Gray–Scott on the GPU, carried by the flow (#327; carried once since 26d)

#327 moved the reaction onto a compute field at the dye's grid (`grayScott`, rgba16float:
u, v, the poured reagent, its pattern) and carried it with the dye's own scheme in the
step. It also ran a second, semi-Lagrangian carry of a frame's displacement in
`stepChemistry`, so the stripes ran ahead of the colour they laid (a pour of reagent and
a pool of dye laid together, stirred: the reagent went 17.7% of the plate to the
colour's 9.2%) and the bilinear backtrace blurred them a cell a frame. 26d took that
carry out (8.9% and 9.2%, 0.3% apart, `npm run turing`) and added the field to the
maze's carry, which had left it standing.

#### 26b. The pattern as a control (#327; Width in plate units and the phone with 26d)

Pattern moves feed and kill along Pearson's map, 0.03/0.055 to 0.04/0.06; Width scales
the diffusion lengths. The lengths were in cells, so a stripe on 256² was twice the
plate's width of one on 512² (4.64% against 2.37%), and Width's top half drove the
explicit step past its stability limit (D·dt ≤ 1/4) into static. Now they are given on
a 384² reference grid and scaled by (N/384)², each unit of time cut into as many
substeps as D needs: 3.06%, 3.12% and 3.19% at 256², 384² and 512². Pattern, Width and
Turing Print are MIDI-learnable and on the phone's Looks sheet when a look runs the
reaction (26b had shipped without the phone).

#### 26d. The look: "Turing Print"

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

## Fourth pass (moved 2026-10-29, 19m-2)

### 26. A reaction that prints: Turing stripes in black and white (proposed 2026-10-05)

#### 26-colour-b. The coral as soft blurred rings

- **26-colour-b. The coral as soft blurred rings (fixed with 26d).** Three causes: the
  deposit read the field on the logical grid, so it drew its top-left corner stretched
  1.3–2.7 times; the field was carried twice a frame, once by a bilinear backtrace that
  blurred it; its width was in cells. The coral looks (Sensual Laboratory, Neon Coral
  Reef) now grow a pattern half the size they showed, where it grew.
