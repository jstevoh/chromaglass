# 27. Every control does something you can see: what shipped

How §27's shipped items were found, built and measured. The open work is in
[`docs/plan/27-controls-you-see.md`](../plan/27-controls-you-see.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 27. Every control does something you can see

#### 27a-8. The closeup's camera holds still through the song (QA-31)

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
Frame Sway (`move = sync × sway` in `macroCamera.ts`, 0 by default; `LiquidVisualizer.tsx` hands the
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

#### 27f-2. Plate Rock leans on the one and three (2026-10-22)

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

#### 27f-3. Beat Squeeze presses a sheet, where the kick lands (2026-10-22)

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

#### 27f-4. The rhythm sheet solved, not stamped (2026-10-24)

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

#### 27f-5. The rock lifts the oil, not the frame (2026-10-24)

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

## Third pass (moved 2026-10-29, 19m)

### 27. Every control does something you can see

- **27a. Plate Rock is the plate tipped (shipped, #305).** It went through the
  half-resolution current as a stir, 0.2 × the spring's swing × tanh of the dye over the
  mean, and its dial went as its square (the kick's shove × R, then the swing × R). Now
  the dial is applied once and, on a thin gap, the tilt is the dye's weight down the
  tipped plate in `hsBody`, with Rain Drip's: a pool slides downhill through the clear
  liquid at Darcy's speed and an evenly coloured plate does not move (`npm run rides`:
  forty pools rocked as the app rocks them moved 0.43 at full, 0.028 before; a look's
  own stir moves them 0.79).
  - **27a-1. The cover glass slides as the dish tips (shipped in #328, taken out by
    #340, back with its drift carried exactly).** #328 put it in and main's deploy of
    10-10 went red: with the band playing `npm run renders` drew 10–21 frames a second
    on the laptop and 11–15 on the phone against 26–32 before, and the same seed
    rendered twice differed (`render-app`). Two causes. The glass was not reset when a
    render starts (`resetPlateClocks` now resets `coverRef` with the rock). And the
    glass drags the whole film at half its slide, a drift of a few cells a step, and
    the carries cut a step into as many substeps as their fastest face needs
    (`CARRY_COURANT`): measured in the lab on the app's 384² solver, Plate Rock 0.2,
    0.45 and full asked 4.1, 8.0 and 12.2 substeps a step of every carry against 1.0
    held still. Now the carries ride the flow less the drift (`driftCells` in
    fluid.ts, `driftOff`), the flow seen from a frame going with the film, and every
    carried field (the colour and its species, the oil's colour, the poured liquids,
    the reaction, the mix, the ferrofluid) is moved with the drift (`driftShift`): its
    whole cells by a shift, which is exact, the fraction by one step of the carries'
    own limited flux. The drift is a model of the film's speed (hsPrep's drag lag at
    the rest gap, within 0.03 of a cell of the lab's plate); what it misses the plan
    carries in substeps, so a wrong guess costs time and never accuracy. And the
    dish's rim met the grid's wall at the middle of each side, where about ten cells
    either way were inside the rim and walled: the glass's flow piled against them at
    3.4 times the plate's speed and set the substeps itself. The rim is open there now
    (hsPrep), as it is everywhere else, and the substeps follow the faces inside the
    rim only (27a-6 says what that leaves). Lab, an uneven plate rocked and kicked as
    the app does it (384², 60 steps): 1.00, 1.03 and 2.17 substeps a step at 0.2, 0.45
    and full, against 4.1, 8.0 and 12.2 before. `npm run rides` 5c holds the default
    at the still plate's substeps (1.00) and full under 2.5.
    What it was: the tilt moves
    colour only where it is heavier than the plate's mean, so on a look whose colour is
    spread evenly a rock moved nothing (the Mac's controls run on #305: Rock visible on
    7 of 23 looks, "nothing" on Boiling Point, Crowd Plate, Red Cabbage, Clock Glass).
    The top glass rides on the film in the bottom glass's bowl and slides downhill as
    the pair tips, a damped pendulum (`stepCover`, lib/plateRock.ts: a 20 cm bowl 6½ cm
    deep, R_c 0.11 m, 2 mm of glass, the film's shear drag ρν/(m_A h) from the look's
    Thickness, 40 mm of rim room); its slide in m/s joins Glass Smear's glass speed in
    hsPrep, so the liquid goes at half of it. A shallow clock glass (R_c 0.18, 30 mm)
    rang the cover out to the rim from Plate Rock 0.2 on, and the dial read 9.4 cells at
    0.2 and at 0.45. Lab (`npm run rides`): an evenly coloured checker slid 0.0 cells
    with the tilt alone (and changed 0.157 with its red made heavier); with the glass
    3.7 cells at 0.2, 8.7 at the default, 13.5 at full, and 18.4 in a liquid 7.9 times
    thicker, each the way the glass went (gain 0.88–0.96 of half its slide, lagged by
    the film's drag time; correlation 1.00). The glass rests at R_c sinθ, swings at
    1.5 Hz on the default oil and creeps back without swinging in glycerine. A phone
    held tipped slides it too.

- **27g. Bass Boost is a gain on the bass's hand (shipped; the owner, 2026-10-22: "I don't feel
  like it actually does anything").** The slider multiplied the ranged bass reading, which every
  hand takes over 70 or 85 and stops: on the band's chorus the reading sat over the press's
  ceiling 0.00 of the time at 1×, 0.57 at 2× and 0.70 at 3×, so turning it up held the glass flat
  and the kicks moved it less (the press's change a second 3.06, 1.83, 0.90; its deepest rose
  only 8%), while the kick detector never saw the slider (29 kicks at every setting). A bass boost
  on a rig is a gain, more cone excursion for the same line. Now the hand follows the bass with the
  boost taken back off (`bassRouteValue`) and lays the boost as a gain on its force (`bassPressFor`,
  the burst's push, the kick's dye and speed): change a second 3.06, 6.12, 9.19, deepest press
  1.13, 2.25, 3.38, pinned 0.00 at each; in the lab on the thin gap the hand moves 0.240, 0.403 and
  0.521 of the plate's colour at 1×, 2× and 3×, and gives it back. At 1× it is the hand it was.
  `npm run bassboost`. The reading itself still carries the boost (the mappings, the meter and the
  camera follow it, clipped at 100 as before); the phone's Settings is the same panel.

## Fourth pass (moved 2026-10-29, 19m-2)

### 27. Every control does something you can see

#### 27a-4. Found: it was the cover glass

    - **27a-4. Found: it was the cover glass** (see 27a-1). On #328's Mac run,
      `npm run renders` on the phone with the band drew 11 frames a second; it showed
      again on main's deploy of 10-10 on the laptop and the phone, and #340 took the
      glass out. Fixed with 27a-1's return: the drift is a shift, not substeps. The
      shift itself then cost half again on a step (QA-25), fixed by reading each cell once.

#### 27a-7. Frame Sway

  - **27a-7. Frame Sway: the music moves the liquid, not the frame (shipped).** The
    owner, the evening 27a-1 went live: "It moves around the x/y axis with sounds ...
    like the whole plate moves around under the camera. Make the liquids and their
    interactions the main focus." The cover glass drags the film, which is the whole
    picture: through a song's kicks at the default Plate Rock it slid the picture
    0.39% of the plate a frame on average and 0.72% at the peak (1.03% on the worst
    show stage), and the lamp jumped 0.32% a frame with the rock (`npm run framesway`,
    the frame loop's own spring, sway and cover at 60 frames a second). A new dial,
    Frame Sway (`frameSway`, 0 to 1, **0 by default**; desk, phone sheet, remote, MIDI),
    is the room between the two glasses' rims: at 0 the cover sits seated in the
    bottom glass's rim, as a clamped clock glass does, and drags nothing; at 1 the
    4 cm 27a-1 gave it. The lamp following the rock and the plate shader's two beat
    pulses (a kaleidoscope's turn and breath, the closeup's crinkle) ride the same
    dial. The tilt stays on: it moves only the colour heavier than the mean, which is
    the liquid's motion. `framesway` holds every shipped look and show stage at 0; the
    Mac's `render-app` holds the app's own frames to it on Classic with the band.
    Evolve never drifts it.

#### 27b. Beat Squeeze presses the glass, not a palm

- **27b. Beat Squeeze presses the glass, not a palm (shipped, #305).** The kick
  pressed three discs a palm wide at 0.0024 × squeeze × bass: at the default squeeze and
  an ordinary kick a ring of colour 30 cells out went 1.7 cells and back. Now the discs
  span the dish (`KICK_RADII`) and the depth is `kickDepth` (0.005 × squeeze × (0.6 +
  0.4 bass)): 5.7 cells at the default, 11 at full. `npm run lift`'s "does not add up"
  floor is now a lone kick's own dip rather than 0.020.

#### 27b-2. The ferrofluid is given back too

  - **27b-2. The ferrofluid is given back too (shipped, #305).** The deeper kick drew
    Classic's poured ring of ferrofluid into the middle (`npm run ferrodrift` on the Mac:
    its mean distance 0.308 to 0.273 before the plate was even held; in the lab four
    kicks took it 0.307 to 0.253). The press moves the liquid up to 14 cells a step on
    256² and the ferrofluid took a fixed six substeps of 0.45 of a cell, so it went out
    short and came back in full. It now takes the colour's own substep plan (`phasePlan`,
    never fewer than six): the same four kicks leave it at 0.311 (`npm run rides`).

#### 27b-3. Breathing beat squeeze and organic liquid injection

  - **27b-3. Breathing beat squeeze and organic liquid injection (shipped).** The owner
    found linear squeeze jumping too fast (only comfortable at 1%), and automated liquid
    additions looking too geometrically planned. Squeeze is now shaped quadratically
    (`squeeze²` in `kickDepth`), opening the bottom half into a gentle breathing range.
    The release uses a cosine ease (`0.5 * (1 - cos(π · p))`), removing sharp velocity
    discontinuities at the hold and release boundaries. Automated liquid doses break out
    of the 14-spoke equidistant circle into natural droplet clusters with randomized
    radial depths (0.55–1.2×), varying droplet sizes, and 2D simplex noise flow drift.
    Verified locally: `npm run lift` (33/33), `npm run squeeze` (9/9 on GPU, gap giveback
    balanced at 3532.566), `npm run downbeat` (91/91).

#### 27e. The music should move the picture more (first part)

  - **Shipped.** The bass is a hand on the glass (`BassPress`, lib/squish.ts): pressed
    as deep as the velocity route is loud over a palm where the burst was (0.004 a
    disc at full and Sound Drive 0.45, up to half again), followed each step, let up as
    the bass falls and all the way when the music stops, moved with an area look's
    bass. The glass moves the liquid only while it moves, so the plate breathes out as
    the bass comes in and back as it goes. Lab: 0.30 of the colour moved as a bass of
    0.8 comes in (the burst 0.006), back to 0.017 once it falls to 0.3; Classic's
    ferrofluid ring 0.3072 → 0.3069 through three swells; nothing at Sound Drive 0. The
    swell reads the energy on its own scale (`levels01`, lib/soundLevels.ts) and now
    pours, on an area look in its areas in turn: every look gains that dye source while
    the music is loud, which no check measures yet (27e-2's film will). Off a thin gap
    the burst pushes as before.

#### 27f-1. Kick Bloom

  - **27f-1. Kick Bloom (shipped, awaiting a Mac read).** `kickBloom` (default 1, the burst as every
    look had it) is the burst's own dial: 0 none, up to 1.5; on the desk, the remote and MIDI.
    Evolve never moves it (`NOT_THE_LOOK`; in its pool it shifted `slowevolve`'s timing). The burst is no longer a ring: two or three lobes at random angles, a fifth of
    the droplets anywhere, distances a third of the radius to past it, sizes 0.33–1.5 of a mean
    droplet, the burst off-centre by up to a third of the radius, each droplet pushed with a wide
    swirl and its own speed. Fewer droplets on average (5–11 against 6–12), about the same dye.
    `npm run panel` greps the source for both (the picture is judging.md §60).
