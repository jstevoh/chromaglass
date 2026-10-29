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
