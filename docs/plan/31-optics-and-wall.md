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
