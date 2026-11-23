# 31. Optics and the wall: what Boris FX Continuum showed (2026-10-11)

*Asked 2026-10-11: the owner shared Boris FX Continuum and asked for more ideas. The
owner put all five below into the plan the same day.*

**What Continuum is.** An offline plug-in suite for After Effects, Premiere, Resolve,
Avid, Nuke and Vegas (2026.5, May 2026): a few hundred effects sold in units (light and
glow, film style, warps, keying, transitions, particles, titles), Mocha tracking, a run
of machine-learning repair and masking tools, and Beat Reactor, which drives any effect
from an audio file through rectangles drawn on a spectrum.

**Where ChromaGlass already stands.** Beat Reactor is the patch bay with 30a's shaping;
Pixel Chooser is §25's areas, the mixer's layers and the wall's shapes; its dissolves are
the look fade, the mixer and 18g's flushing; Particle Fluid Dynamics is the solver; Motion
Blur ML's trail is 5-shutter; Curl's heat haze is 18f through 18e's index; its colour
management is 18k-linear; Super LED is Art-Net (14q). The rest is post-production on
footage, or a picture laid over the plate.

**Ranked.** By what a performer gains for the work; each is briefed by Claude with its
check written first and built by Antigravity. None moves the whole frame by default, and
every sound reading is a fast one (the owner's rules).

1. **31a**, the projector's focus across the two dishes.
2. **31b**, a warp grid for curved walls.
3. **31c**, two more ways to shape a sound cord (with 30a).
4. **31d**, colour at a defocused edge (inside 18e).
5. **31e**, halation in the Photograph style.
6. **31f**, Lens Type: real projector and camera lenses (2026-10-31, after 31a).

## 31a. Both dishes are always in focus

The plate's two layers are drawn sharp, as if they sat in one plane. The camera looks
have a focus, but over the dye's painted height (`camera.ts`, the circle of confusion from
`h − U.focus`), which 18e says is not a real height. On an overhead the two dishes sit at
different heights between the condenser and the lens, so the lens focuses on one and the
other goes soft: the blur is a disc, the lens pupil's image, sized by the thin-lens law
from the distance between the dishes and the aperture. Riding the focus from the colour
dish to the oil dish is a move an operator makes by hand. Add one focus control in the
projector's terms (which plane, and the lens's aperture): each layer gets a disc blur sized
by its distance from that plane, and the same distance is 18e's shadowgraph Δz, so the
edge doublets flip as focus passes through a layer, as Becke lines do. The default keeps
both layers sharp (today's look). MIDI-learnable, on both desks and on the phone's remote.
*Measure:* in the lab, a sharp disc on each layer: the edge's 10–90 % width against the
focus setting within 10 % of the thin-lens prediction, and the default the same picture
to the bit. After 18e.

## 31b. A surface on the wall is four corners only

Every surface is four corners and one projective map (`outputConfig.ts`): right for a
flat wall, wrong for a dome, a column, a curved cyc or a hanging sheet, which gigs often
have. Let each surface carry a grid of control points (up to 8 × 8, smoothly
interpolated) inside its corner pin, and load an ST map (a 16-bit image of UV coordinates
exported from projection-mapping or calibration tools). The test pattern goes through the
same grid. On the phone, the remote's wall page drags grid points as it drags corners now.
*Measure:* `npm run map` extended: a known warp applied to the test pattern puts each
grid crossing within half a wall pixel of where it should land, and an untouched grid is
the same picture to the bit.

## 31c. A sound cord reads only how loud its band is

Beat Reactor's samplers have a mode that outputs *which* frequency in the rectangle is
loudest, and a delay. Add both to 30a's cord: a third mode, *where in the band*, whose
output is the position of the loudest part inside the dragged band (0 to 1), so a walking
bassline moves a setting (a hue within the palette, say) by its note and not its
loudness; and a delay per cord, in beats or milliseconds, so one kick can land on two
settings one after the other. Absent fields read as today. On the phone, the patch view
carries both. *Measure:* added to 30a's check: a tone swept across a dragged band gives a
rising output within one bin, and a delayed cord fires within a frame of its delay.

## 31d. A defocused edge has no colour

A liquid's index varies with wavelength, so 18e's shadowgraph evaluated per band gives
the bright and dark doublets at a defocused oil edge faint colour. Small: inferred at a
few per cent of the deflection for water against mineral oil, so a refinement and not a
new look. Inside 18e, use the six-band spectral path that exists and give each liquid a
dispersion (Cauchy coefficients) next to its index in 18d. Chromatic aberration stays a
named dial in the camera looks only. *Measure:* in the lab, the red and blue fringe
offsets at a defocused oil edge in the ratio the Cauchy fit predicts, and zero at focus.

## 31e. The Photograph style glows white

The photographs the style is built from are on film, where light through the emulsion
reflects off the base and comes back through the red-sensitive layer first: a red-orange
halo round bright highlights, its width set by the base's thickness (halation). The
camera pass's bloom is white, the digital version. In the Photograph style, make the
bloom a halation kernel weighted to red at a fixed width in film terms; off in the
light-show style, as bloom is. *Measure:* a `look` render: the halo round a point
highlight is redder than its source, and its radius holds when the plate's resolution
changes.

## 31f. Lens Type: real projector and camera lenses (asked 2026-10-31)

*The owner asked whether lens styles belong in the physics, chose "projector and camera
styles" on 2026-10-31, and named the picker **Lens Type**.*

**Where it stands.** Projector Focus bends light for real at an oil edge (18e's
shadowgraph from n·h), but both dishes sit in one plane (31a). The camera pass's lens is
partly painted (`src/gpu/wgsl/camera.ts`): its circle of confusion is
`abs(h − focus) · aperture · 9` over the dye's painted height, its fringing a dial
(`chromatic`) rather than a glass, and its vignette and grain fixed at 0.6 in
`fillCameraUniforms`. No setting says what lens is in front of the plate.

**The rule for every Lens Type.** A type is a set of numbers a real lens has, never a
filter: focal length, f-number, the mapping from angle to image height (rectilinear
`r = f·tanθ`, equidistant fisheye `r = f·θ`), distortion (Brown–Conrady k1, k2),
relative illumination (cos⁴θ times the pupil's mechanical vignetting), the pupil's shape
(blade count, an anamorphic squeeze), field curvature (Petzval radius) and the glass's
dispersion (Abbe number V, which sets lateral colour). Each type's numbers come from a
datasheet or a lens-design reference cited in the PR, not tuned by eye. The dials under
the picker scale those quantities from very gentle to past nature (the owner's rules,
2026-10-30 and 10-31). Every type is MIDI-learnable, on both desks, in presets, and on the
phone's remote, in the same PR. Lens flares and light leaks stay out (Not copied, below).

- **31f-1. One lens model (after 31a).** A pure module beside the camera code
  (`src/lib/lens.ts` or `src/gpu/lens.ts`, plain functions over numbers) that turns a Lens
  Type and its dials into uniforms, read by both the plate's projector path and the camera
  pass, so nothing downstream is told two things about one lens. 31a's thin-lens disc blur
  per dish is its focus term. In the camera pass, the blur's distance becomes a real one
  (the solver's surface height, the drops' domes in the gap, at 38r's real millimetres)
  instead of the painted `h`, the `chromatic` dial becomes the glass's V (a dial past real
  dispersion allowed), and the fixed 0.6 vignette becomes the lens's own falloff.
  *Measure:* in the lab, a sharp disc's blur width against focus and f-number within 10 %
  of the thin-lens prediction; a grid's distortion within half a pixel of the
  Brown–Conrady mapping; the corner-to-centre ratio within 2 % of cos⁴θ times the pupil;
  and the default type the same picture to the bit as today.
- **31f-2. Projector Lens Types.** On the projected show:
  **Classic overhead** (a typical overhead projector's head lens, the default, today's
  look); **Fast** (a wide aperture, so 31a's two dishes cannot both be sharp and riding
  focus between them is the move); **Dome fisheye** (an equidistant mapping for domes, its
  output through 31b's grid); **Vintage singlet** (a single crown-glass element: lateral
  colour from its V, Petzval field curvature softening the corners, stronger falloff);
  **Prism attachment** (the multi-facet prism lens real light shows mounted on the
  projector: each facet deviates the image by δ ≈ (n − 1)·A with its own dispersion, and
  turns by hand or by a cord). The prism repeats the picture, which "Not doing" refuses
  as a warp; it is kept because it is a glass the light goes through, with each copy
  blurred and fringed by optics, not a tiling, and it is off unless picked.
  *Measure:* each type's numbers printed against its source; the prism's copy offset
  within 2 % of δ at the type's apex angle and index, and red-to-blue offsets in the ratio
  its V predicts.
- **31f-3. Camera Lens Types.** On the Photograph style and the closeup:
  **Macro 1:1** (depth of field from the macro law, total DoF ≈ 2·N·c·(1 + m)/m² at
  magnification m, so a dome's top and its foot cannot both be sharp); **Petzval
  swirl** (a portrait Petzval's field curvature and cat's-eye vignetting, which swirls the
  out-of-focus discs toward the frame's edge); **Anamorphic 2×** (an oval pupil, so blur
  discs are ovals squeezed 2:1, and the frame desqueezed); **Tilt-shift** (the focal
  plane tilted by the Scheimpflug rule, so a band across the plate is sharp).
  *Measure:* in the lab, the macro type's sharp band against the DoF law within 10 %; the
  anamorphic disc's aspect 2.0 ± 0.1; the tilt-shift's sharp band where Scheimpflug puts
  it; the swirl's discs elongated tangentially, more with distance from the centre.
- **31f-4. Lens Type on the desks and the phone.** The picker and its dials (f-number,
  distortion, dispersion, the prism's turn) on the Design desk's Lens section and the
  Perform desk, in the phone's remote, MIDI-learnable, and saved in presets; absent from
  old presets reads as Classic overhead / today's camera. Ships with whichever of 31f-2 or
  31f-3 lands first. *Measure:* `npm run panel`, `npm run desk`, `npm run phone`, and the
  `setting-auditor` agent.
- **31f-5. Your own Lens Types (Pro).** *The owner, 2026-10-31: "just like liquids, let
  pro users create new lens types based on customizing key variables".* As a liquid is
  made from its properties (`lib/liquidFile.ts`, `*.liquids.json`), a Lens Type is made
  from 31f-1's numbers: a `*.lenses.json` file (`"format": "chromaglass.lenses"`), a name,
  and any of focal length, f-number, the angle mapping, distortion k1/k2, falloff, blade
  count and anamorphic squeeze, Petzval radius, the glass's index and Abbe number, and for
  a prism its facets, apex angle and index; a field left out is the Classic overhead's
  value, and a number out of range is held to its range (which may run past real lenses,
  as the dials do), not refused. A Lens Designer on the Design desk starts from any
  built-in type and shows each change on the plate as it is made; the phone's remote edits
  the same numbers through the same lib functions. Making, editing and importing a lens
  is Pro, asked through `tierGates` like custom liquids (the owner's same-day rule,
  built in its own thread); own lenses travel in presets, set lists, the show kit and
  Pro's cloud sync beside own liquids. *Measure:* a node check that a file round-trips,
  out-of-range numbers clamp, a missing field reads as Classic overhead, and a Free or
  Home licence cannot save or import one; `npm run panel`, `npm run desk`,
  `npm run phone`, and the `setting-auditor` agent.

**Not copied.** Sprites and overlays (Lens Flare, Atmospheric Glow, Orbs, Smoke & Fog,
Light Leaks): pictures laid over the plate, where a show's glow is the lamp through the
liquid (18b, 18e). Glitch, Scanline, Mosaic, Kaleidoscope, Ripple and Displacement
warps and the dissolve library: what every VJ tool ships ("Not doing"), and Beat Reactor
mostly drives them as whole-frame motion, off by default here. The gobo library, Light
Flicker and Flashing (the flash guard, 14i, keeps flashes off the wall). The
machine-learning tools (DeNoise, UpRes, Retimer, Face, Matte Assist, Depth Map): they
repair or mask footage the plate does not have, and anything that reads as generated fails
the rule that nothing looks like AI. Keying, retouching, titles and the VR tools: footage
work. The audio visualizer's spectrum bars.

## 31p. Polarised light: the owner's photograph of dishes between polarisers (2026-11-14)

*The owner, 2026-11-14, sent a photograph of moulded petri dishes between polarising sheets
("Check these bubbles out"; `references/still-polarized-dishes` in the project's shared
files): rainbow bands in the Michel-Levy order, pinwheel fans about each dish's injection
point, thin pale rims, a pale field (the sheets not fully crossed). The colours are
birefringence, not a thin film. The owner asked for the polariser, a turnable analyser and a
liquid that lights where its flow stretches it ("Let's do it!").*

- **31p-2. The colour lingers after the stir.** A liquid that shows flow birefringence has a
  relaxation time: its molecules stay lined up for a while after the flow that lined them up
  slows, so a stirred micelle solution keeps glowing and fades. 31p-1 reads the strain rate
  of this instant (a Newtonian liquid's stress). Carry a conformation tensor on the solver
  (Oldroyd-B: advected, stretched by the velocity gradient, relaxing at a time the dial
  sets), and take the retardation and axis from its anisotropy. A solver field, so it lives
  in `src/gpu/fluid` and the plate reads it. *Measure:* a stir stopped dead keeps its colour
  for about the relaxation time and then goes dark, in the lab; a check in `npm run polar`.
- **31p-3. Stressed solids on the plate: dishes and cellophane.** The owner's photograph is
  of moulded dishes with stress frozen round the injection gate (radial and hoop axes, so a
  pinwheel crossed with plane sheets and rings with the plates in) and cellophane is the
  classic light-show retarder (a fixed retardation per layer, stacked to climb the orders).
  Retarders in series with different axes combine by Jones matrices, which needs the third
  table term 31p-1 already carries. *Measure:* a dish's gate shows a four-armed cross with
  Quarter Wave at 0 and none at 1; two cellophane layers at the same axis add.
- **31p-4. The second plate's liquid.** 31p-1 reads the lead plate's flow (`vel0`); a
  two-plate look's back plate retards too. Two retarders in series at different axes are
  not one retarder; for small retardations the doubled-angle vectors add, and exactly they
  multiply as Jones matrices. *Measure:* the same stir on Layer 1 alone lights as on Layer 0.
- **31p-5. The dye's own spectrum through the sheets.** The plate multiplies the picture by
  the sheets' RGB colour, the product of the integrals, where the light on the wall is the
  integral of the product (a narrow-band dye through a narrow band of the chart). Exact
  would carry the dye's absorption spectrum into the table. *Measure:* against
  `polarSpectral` with a dye's spectrum, the drawn colour within a few levels.
- **31p-6. The scale in real units.** The Birefringence dial is nanometres per unit of the
  solver's strain rate, measured in the lab, because the plate has no physical clock for
  its velocity. When the solver has one (mm/s at a known Speed), the dial can become the
  stress-optic coefficient times the viscosity, with the liquid's depth from the gap.
- **31p-7. Glitter and the side lamp through the sheets.** The lens pass (`gpu/glint.ts`)
  draws after the display, so its glints are not between the sheets. Polystyrene flakes
  depolarise; the side lamp is not polarised by the stage's polariser and passes the
  analyser at a half. *Measure:* with the sheets in and crossed, a still plate's glints are
  dimmed by the analyser and not by the polariser.


## 31s. The surface is drawn from the dye, not traced from the liquid (2026-11-22)

*The owner, 2026-11-22, on the flower (eight grey discs round every moving drop, 15g-15):
"why are we using stencils at all? ... and not simulating the actual physical effect of
things?" The flower was a sampling fault: the plate's slope was read from taps three cells
apart, so a drop narrower than that was seen once per tap and drawn eight times. The stopgap
(15g-15) reads the slope with a dense smooth stencil instead, but the deeper fault stays:
the light the plate draws is not the light a liquid would throw. The optical path comes from
how much dye sits in a cell, not from the shape of the oil and water surface, and the light is
only darkened where it is, never moved, so there are no caustics: no bright rims focused by a
lens-shaped drop, no shadow beside it.*

- **31s-1. The liquid's surface height as a solver field.** A height field h (the oil layer's
  thickness over the water, and the water's own free surface) advected by the flow and levelled
  by the thin-film (lubrication) equation: dh/dt + div(h u) = -div( h^3/(3 mu) grad(p) ), with
  p = -sigma lap(h) + rho g h. Surface tension pulls a drop's edge into a meniscus whose width is
  the capillary length (about 2 mm for oil on water, sqrt(sigma/(rho g))); gravity levels a
  wide pool. Interfacial tension between oil and water sets the contact shape where the phases
  meet (the phase field already knows where). *Measure (lab):* a still lens of oil keeps the
  meniscus profile set by the capillary length (within 10%); a sine ripple of wavenumber k on a
  layer h0 decays on tau = 3 mu / (h0^3 (sigma k^4 + rho g k^2)) (within 15%); mass of h is
  kept to 0.1% over 600 steps.
- **31s-2. Light traced through the surface, gathered on the wall.** Each lamp ray leaves the
  lamp, bends at the surface by Snell's law (air, oil, water and glass indices, the slope from
  31s-1), and lands on the wall where its new direction takes it; the wall's brightness is how
  many rays land in each pixel (the inverse Jacobian of that map). A lens-shaped drop then
  focuses a bright rim and throws a shadow beside it by itself, as on an overhead projector.
  This replaces the dye-thickness optical path and the aperture darkening (refractionOptics),
  and the stopgap's dense slope stencil (15g-15). *Measure (lab):* a plano-convex drop of
  radius R focuses at R/(n-1) within 10%; a flat plate lights the wall evenly (1%); light is
  kept (total on the wall within 1% of total in); no feature is drawn twice (one peak per drop
  in the wall's autocorrelation).
- **31s-3. The other sparse stencils.** Still reading the plate at a stride: the camera's
  camLap (an 8-tap max, plateTransmit.ts), lacing() (a 4-tap cross at 3 cells, 33c), the
  lamp's lampBendAt and defocusShadow's reads of the derived layer, and blurAlpha (3x3). (The
  bubble glow's airNear, a 9-tap max at 4.5 cells, went with 31s-8.) Each that reads the dye
  itself at one texel a tap, where the dye has four texels a cell, can comb a thin rim the way
  31s-8 found, and should take the cell's mean the way `cellDensity` does. Each can draw
  ghost copies of anything narrower than its stride the way the slope did. Replace each with the
  traced light of 31s-2 where it is optics, or a dense stencil where it is a field read. `npm run flower`
  measures only the slope and its ∇², so none of these is covered by it yet (31s-10).
- **31s-4. Retune the looks on the traced light.** Once 31s-2 draws the plate, every preset's
  brightness, contrast and rim weight moves. Retune on films from the Mac, judged by the owner
  against the reference library (watch skill).
- **31s-6. Open, found on main's deploy of 2026-11-22 (ebfa3324): `npm run holeline` was
  calibrated on the stride-3 stencil 15g-15 replaced.** The dense slope (#933, `plateSlope.ts`,
  sigma 1.5 cells) reads a hole's rim about 1.6 to 2 cells wider than the Sobel did, so
  holeline's precondition throws before any line is judged: "the hole of 5.0 cells has its rim
  at 6.7 cells" against `RIM_SLACK` 1.5 (bisected to ea277f3d; 61cab2c4 passes). Past it, on
  the dense stencil, every feature line holds ("no line round a hole" at most 0 levels) and two
  controls miss: "the control finds the glow" (3.7, wanting more than 6) and "the smallest hole
  is partly flattened" (5.28 against 0.9 times 5.47). A narrower stencil (sigma 1.0) breaks the
  controls further, so it is the check's yardstick that moved, not the picture. Fix: read the
  rim the way the dense stencil spreads it (its reach, `SLOPE_REACH2`, rather than a fixed
  slack), and set the glow control's size row from the dense slope's own response, or from
  31s-2's traced light once it draws the plate. Never a looser bar without the owner's word;
  until then holeline stays red on main's checks (the site deploys without them, 19ak-21).
- **31s-7. Open: two films and the Mac app still draw the flower.** Four films are re-recorded on
  main with the dense slope and replace the privated ones (shipped 2026-11-22: Effervescence,
  The Distant Sun, Undertow, Machina, each with its card loop; a close look at Galaxy's bubbles
  in the new film shows one ring each, no lobes). Hymn to the Dawn and Permafrost were filmed
  before #933, so their channel films and card loops still carry it: re-record both with
  `npm run sitefilms` and swap them the same way. The Mac app's last release (1.3.1652) was
  built before #933 and draws the flower until the next release. A preview server left running
  from an old checkout shows it too; judge only from main or the live site.
- ~~**31s-8. The flower's second life: four texels a cell.**~~ **Shipped** (`npm run flower`).
  #933's dense stencil still drew the flower at headed 2x Chrome on Galaxy at tier=local: its
  taps sit a cell apart (logicalGrid 192) but the dye is 768², four texels a cell, and each tap
  read one texel, so a rim thinner than a cell was copied at every tap offset. Each tap now reads
  its cell's mean (`cellDensity`, 3x3 bilinear sub-taps), the air is read as missing dye held to
  the middle's density (`heldAt`, `AIR_HELD`) and the slope and ∇² are weighed by the dye under
  the pixel, so `airNear`'s flattening is gone. `npm run flower` reads the comb (what a one-cell
  box leaves of the slope and ∇² near a rim) on a ring, a disc and a bubble: build 0.04 to 0.08
  against a point-read control of 0.33 to 0.35 (bars 0.10 and 0.3). Every harness that films the
  plate (recorder, film, showreel, sitefilms) runs it first and refuses to record a build that
  fails; `FILM_ALLOW_FLOWER=1` films anyway for a private take, flagged in the log.
- **31s-9. Open: ∇² ripples on a gentle tilt.** Found by `npm run flower`: dye on a linear tilt
  (no rim, no air) should read zero Laplacian, but the derive pass reads a smooth ripple of
  period three cells (about ±0.07 in its units) all across the tilt, far past the slope's
  reach, under both builds alike (the point-read control as a square wave of the same period).
  Suspects: how calcOpl turns dye into optical path, a channel of the dye the path does not
  share, the half-float derived layer, or perTap/oplAt. Measure first: ∇² of a pure tilt with
  no air, by channel and by derived format. The flower check uses a piled rim, not a tilt,
  until this is found.
- **31s-10. Open: the flower check sees one size and one layer.** `npm run flower` measures the
  derived layer at gridSize 768 only; the app also runs 512 (2.7 texels a cell, where a one-cell
  box is not a whole number of texels) and 1024. Nor does it measure the drawn picture, so a
  stencil downstream of the slope (31s-3) could draw the flower with this check green. Measure
  each size with a box of its own cell, and the drawn frame of a ring with the comb.
  The gate itself (31s-8) covers every harness that records the plate for anyone to see:
  `recorder.mjs` (every take, asking the open page for the fixed code), `film`, `showreel`,
  `sitefilms` (and its `--films-from`), `tvloops` (and `--from-raw`) and `tvfilms --from`.
  Left out on purpose: `render-app` and `clipApp` record only for their own checks, and
  `landingfilms` and `render.mjs` record nothing.
- **31s-11. The flower gate checked another tree.** *(Shipped with 34a-6f.)* A harness's bundle
  runs from `node_modules/.cache`, and the gate found `scripts/flower.mjs` from the bundle's own
  path. In a worktree whose `node_modules` is a link to another checkout (`~/cg-ambient` links to
  `~/chromaglass-main`), Node names the bundle by the link's target, so the gate ran the other
  checkout's check: there it was too old to have one and refused, but a checkout with the fix
  would have passed a tree that still draws the flower. `flowergate.mjs` now runs the check in
  the tree the harness runs in (the working directory, where npm starts a script) when it has one.
- **31s-12. Open: linked worktrees share one bundle cache.** The same link means every harness a
  linked worktree runs (`sitefilms`, `film`, `showreel` …) writes its bundle to the other
  checkout's `node_modules/.cache/<name>.mjs`, so two sessions running the same harness from two
  trees overwrite each other's bundle between build and start. Bundle into the tree's own
  `scratch/` (git-ignored), or name the bundle by the tree.
- **31s-5. A realism audit that starts from the rig, not from the code.** The four realism
  passes (§18, §38) went through the code's effects one at a time and asked whether each was a law or
  a stand-in. That way of asking can only find faults in effects someone already wrote. It cannot see
  a phenomenon that nobody built, or a field that is read wrongly. That is how the flower got through
  every pass. It came from a sparse stencil, which is a correct operator on anything wider than its
  stride and draws ghost copies of anything narrower. It also got through because no pass followed
  the light out of the dish, so none asked what a small drop's curved surface does to it. This audit
  turns the question round. Walk the real rig in order (lamp, condenser, glass, liquid layers, glass,
  projection lens, wall, eye). For each stage, list what physically happens there from optics and
  fluid texts, never from our code. Then mark each item as built (with the file), faked (with what
  stands in for it) or missing. Six areas, each with its own list:
  1. **Depth.** The layers have thickness: film height, meniscus, a drop's cap, oil over water, and
     what lies at the bottom against what lies at the top. Is any of it a field, or does the dye
     stand in for it? (31s-1 builds the height.)
  2. **Light all the way through.** Refraction at each interface, total internal reflection, focus
     and caustics, Beer-Lambert absorption by depth, scattering in milky dyes, Fresnel loss and
     dispersion. Does energy add up from the lamp to the wall? (31s-2 builds the trace.)
  3. **Lens and wall.** Depth of field across a dish that is not flat, the lamp's size against how
     sharp an edge can be, vignetting, keystone, the wall's texture and bounce, and how bright the
     wall is against how the eye adapts.
  4. **Sampling.** Every shader read of a solver field at a stride over one cell, every max or min
     over sparse taps, every place a field is drawn at another resolution, with what each can ghost
     or alias. (31s-3 holds the known ones.)
  5. **Dish edges.** The meniscus against the rim, wetting and contact angle, the rim's shadow and
     its refraction, and how drops behave next to the wall of the dish.
  6. **Time.** How fast each thing happens in a real dish (diffusion, Marangoni spreading, settling,
     evaporation, heat from the lamp) against the solver's steps, and what the frame rate smears.
  Checks. (a) Lab: seed single small drops (one to three cells) and moving ones, render the wall,
  and assert one peak per drop in the picture's autocorrelation, with no copies at the stencil's
  offsets. It must fail on the old three-cell Sobel. (b) The optical numbers of our films against
  the real-show references kept for `npm run watch` (jls-liquid-loops-1969, bar-the-dip-2016):
  edge width, how sharp and how high the brightest caustic peaks are, and the dark rims round drops.
  Any number outside the references' range becomes an item in its area. The two halves check each other
  (the owner, 2026-11-22): a number of ours outside the references' range is a symptom, and every
  symptom must point at a rig item that explains it. A symptom nothing explains means the rig walk
  missed a phenomenon. An item marked built whose number is still out of range is really faked. The
  watch tool gains a ghost measure (secondary autocorrelation peaks round small forms), which would
  have caught the flower from the films alone. Each missing or faked item
  the audit finds becomes a plan item in the section it belongs to. Antigravity runs it after 31s-1
  lands. 38w-7 (small cells drawn as rounded squares) may be the same square stencil, so re-film it
  after 15g-15.
