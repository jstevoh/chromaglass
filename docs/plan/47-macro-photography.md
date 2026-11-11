# 47. The closeup as a macro photographer films liquid (asked 2026-11-11)

The owner, 2026-11-11, sharing a macro artist's site (davyevans.co.uk, its Microlab page
above all): "Anything we should get ourselves? This is beautiful work", then "our macro
stuff isn't great". This section is what that work is made of, as physics and optics, set
against what our closeup (`macroMode`, `macroCamera.ts`, `dropCam`, §33g, 38h-7) draws today,
and ranked by how much of the gap each item closes. We take the techniques, never a
particular piece: no item reproduces one of the artist's films or images.

**What was read.** The site's project pages (the text on each), the Microlab page's eleven
films by their own descriptions and their poster frames (Vimeo's public oEmbed), and two
press features. The Microlab films themselves were not played: Vimeo refuses a cloud
address, and on the owner's Mac a headless browser met its bot check, which we do not get
round; the route is the owner's own screen recording (`scratch/davy/` on the Mac). What the descriptions say, in their own words: "Micro chemical
reaction in a 3x3 inch Petri dish [6144 x 3456 30fps]"; "filmed under UV lights using
fluorescent materials"; "All macro effects have been filmed with a canon 5D Mark 3 and a
100mm macro lens"; "blending acrylic paints in a 90mm Petri dish", time-lapsed over five to
ten minutes; "chemicals are dropped onto the surface of a thin layer of water, where organic
Voronoi patterns form before the material solidifies"; "inks and dyes are used to visualise
water currents as they pass through a vortex"; "glass and light"; reactions "often no larger
than a few inches in diameter". The press: "completely analog, created by the reactions of
chemicals in water", oil-rich liquids mixed with household chemicals.

**Watched over time (2026-11-11, `npm run watch` on the owner's Mac).** Two of the
artist's films that are on YouTube: the official visualiser for a Max Richter piece (3:52)
and *Biolume* (3:50, a third party's upload under the artist's name). Read over each whole
film: near black 30 % and 46 %, motion median 4.7 and 2.7 (90th percentile 17.1 and 9.6),
3.4 and 3.1 swells a minute, calm 53 % and 52 %, two hues a frame, 10.4 and 7.6 cuts a
minute. Both are edited, so the swells are mostly the edit; inside an uncut shot, sampled 8
times a second, the motion is very even (median 1.1 to 8.5 by shot, the 90th percentile
barely above the median in three shots of four). So each shot is one slow, continuous
process, and the variety comes from cutting between processes. What the frames show:
in the visualiser's long shot (from 1:49) **almost the whole picture is a caustic network**,
bright lines of focused light on black that drift and re-form, not dye colour at all (47j);
in *Biolume*, under UV, a film that opens dark holes with rims as it thins, a polygonal mesh
like a dewetting film, closely packed cells with thin walls and radial streaks inside them
(Marangoni flow, 47g), and a second, orange fluorescent colour growing in the cells' cores
(47c). Sheets and timelines: `~/chromaglass/scratch/davy/` on the owner's Mac.

**What the poster frames show, across the eleven.** A black ground everywhere, with the
liquid as the only light. Structure at every scale at once: a front a few millimetres
across is lined with filaments and pores a few hundredths of a millimetre wide, each sharp.
Interfaces brighter than the bodies either side (rims, fronts, the edge of every pore).
Fluorescent blue and magenta that glow and bleed a soft halo into the black. Pin-point
glints and out-of-focus discs from tiny bubbles and suspended specks. A sharp slice with
the rest falling off into blur. Dye wound into helices by a vortex. Clear viscous threads
lit from the side, glinting.

**What ours draws today, photographed from the owner's Mac** (Macro Bead, 2026-11-11,
`look_at_plate` large; `/mnt/project-files/macro-davy-evans/ours-macro-bead-2x.jpg` and
`-6x.jpg` in the project's shared files). At 2x: a smooth blob of dye, a soft gradient
inside with no fine structure, a serrated edge where the grid's cells show, beads drawn as
lenses with a hard dark crescent. At 6x: one soft smear, a few faint streaks, the edge
rippling at the cell's pitch. No glint, no particle, no blur that depends on depth, and the
black ground is flat. The single largest difference is not the lighting: **ours magnifies a
coarse field, theirs films a small field at fine resolution.** A 76 mm dish at 6144 px is
12 µm a pixel; our plate's grid over a dish of tens of centimetres is most of a millimetre a
cell, so at 6x one cell covers about twenty screen pixels.

Every item keeps the standing rules: physics at the core (each names the phenomenon and any
shortcut), no whole-frame motion from sound, a default that keeps today's look, and the
phone version in the same PR.

## 47a. Detail at the closeup's own scale: a fine window, with the dye finer than the flow (L)

*Seen:* sharp structure down to a few hundredths of a millimetre inside a reaction a few
centimetres across. *Physics:* a dye in water diffuses about a thousand times more slowly
than momentum (Schmidt number Sc = ν/D ≈ 10³), so stirring folds it into filaments far
finer than the smallest eddy: the Batchelor scale, η_B = η·Sc^(-1/2), about thirty times
finer than the flow's own smallest scale. Fine dye over coarse flow is therefore not a
cheat but what a real dish does. *Today:* the closeup is a crop of the whole plate's grid,
magnified 1x to 16x; the particles of H1 (`wgsl/particles.ts`) carry finer structure than
the grid, but at zoom they are drawn at the plate's scale, not the screen's. *Build:* in the
closeup only, a second dye field covering the camera's window at screen resolution (about
0.1 mm a cell at 6x), advected by the plate's velocity interpolated smoothly (one-way
nesting, as a weather model nests a fine grid in a coarse one), seeded from the coarse dye
when the window moves and fed back to nothing. Molecular diffusion at its real D (so a
filament keeps its edge for seconds, not frames), and the window's own velocity correction
where surface tension acts at that scale (capillary and Marangoni forces grow as the scale
shrinks, so the fine window is where they belong). *Shortcut, named:* the fine window does
not feed back into the coarse flow. *Measure:* in the lab at zoom 6, structure at 4 to 8
screen pixels (the H1 measure) at least three times today's, and the edge's ripple at the
cell's pitch gone (`macroview` gains both lines). Frame cost held by `npm run stages`.
- **47a-1. First, the particles and the dye's edge at screen scale in the closeup** (S–M).
  Draw H1's particles as screen-sized discs when `macroMode` is on, and cut the dye's edge
  by its interpolated level set rather than its cells (with 38h-9, which names the same
  grain). Closes the serrated edge in the photograph cheaply before 47a's window.

## 47j. Caustics: the light focused into a network by a rippled or mixing layer (M)

*Seen:* in a whole long shot, the picture is bright lines of focused light on black that
drift and re-form, like sunlight on a pool floor. *Physics:* a layer whose optical path
varies (a rippled surface, or two liquids of different index mixing) bends the light by the
gradient of the optical path; at a distance z past it the light lands where the ray map
x → x + z·∇OPL sends it, and the intensity is the source's divided by the map's Jacobian,
I = I₀ / |det(I + z·∇∇OPL)|. Where the determinant passes through zero the rays cross and
the light piles up into caustic lines (folds and cusps), bright and sharp, with dark
between. *Today:* the shadowgraph (38h-3, `defocusShadow` in `plateTransmit.ts`) is the
linear term, ΔI/I ≈ −Δz·∇²OPL/OPL: right only while z is short of the first crossing, so it
draws Becke doublets at edges and can never make the network; no file in the plan or the
code says "caustic". *Build:* past the linear range, take the intensity from the Jacobian of
the ray map (the Hessian of OPL, which the derive pass's Laplacian already half computes),
clamped at the folds by the source's angular size (a lamp is not a point, which sets how
thin and bright a caustic line can be) and by diffraction; on the projected plate and in
the closeup (with 47b's dark field, the network is the whole picture). The defocus that
reaches it is the projector's focus and the closeup's Focus dial (47d). *Shortcut, named
if taken:* a single bounce through the column's summed OPL rather than layer by layer.
*Measure:* in the lab, a sinusoidal OPL of known amplitude and period forms its first
caustic at z = 1/(k²·A) within 5 %, the light is conserved over a period within 2 %, and at
Δz below the first crossing the result matches today's linear shadowgraph within 1 level.

## 47b. Dark-field and Rheinberg lighting for the closeup (S–M)

*Seen:* a black ground on which only edges, fronts, pores and threads glow. *Physics:*
dark-field illumination: the lamp lies outside the lens's acceptance cone, so undeviated
light misses the lens and only light bent by a gradient of refractive index or scattered by
a particle reaches it. It is the complement of the shadowgraph and schlieren the plate
already draws (38h-3, `pupilPass`/`edgePass`, `plateTransmit.ts`). Rheinberg illumination
is the coloured form: a coloured centre stop and a differently coloured ring, so bent light
takes one colour and the ground another. *Today:* every lamp in the closeup sits inside the
pupil. *Build:* a Lighting choice in the closeup, Bright field (today) / Dark field /
Rheinberg (two colours), computed from the same bend the pupil law already reads, with the
lamp's cone set as an annulus outside the pupil. *Measure:* `nolight`-style lab lines: in
Dark field a flat dye with no gradient reads black within 2 levels, a front's ring reads
brighter than either side by at least 30 levels, and Rheinberg's ring takes the ring's hue.

## 47c. Blacklight: fluorescent dyes under a UV lamp (M)

*Seen:* blue and magenta that glow out of black, brightest where dye is thin and fresh, with
a halo. *Physics:* fluorescence: a dye absorbs the lamp's near-UV (365 nm) by Beer-Lambert
and re-emits a share of it (its quantum yield) at a longer wavelength, equally in every
direction, so it looks self-luminous whatever the viewing angle. The glow grows with the
absorbed UV, 1 − exp(−ε c L), so it saturates where dye is thick (the inner-filter effect)
and a non-fluorescent dye in front absorbs the emission and reads dark. The emitted light
scatters in the liquid, which is the halo. Household examples: fluorescein and pyranine
(highlighter ink, green), quinine (tonic water, blue), rhodamine (orange-pink). Blacklight
shows are part of the liquid light show's own history, so this is an instrument as well as a
macro look. *Today:* no dye has a fluorescence; black-ground looks make the liquid "its own
light" by its colour, not by absorbed UV. *Build:* a per-bottle fluorescence (emission
colour, yield) beside the existing absorption in `lib/chemistry.ts`; a UV Lamp dial that
dims the visible lamp toward black and adds the emission term in the plate shader in linear
light, with the inner filter and the cross-absorption by other dyes; the halo as the
emission blurred by the liquid's scattering length. A few bottles in the palette that
fluoresce (named for real dyes). *Measure:* in the lab, emission against concentration
follows 1 − exp(−εcL) within 10 %, a non-fluorescent dye laid over a fluorescent one darkens
it by its own transmission, and with the UV Lamp at 0 every look is unchanged to the bit.

## 47d. Depth of field from the gap's real depth, with bokeh in linear light (M)

*Seen:* one slice sharp, the rest soft; bright specks become discs. *Physics:* at 1:1 a
100 mm macro at f/2.8 holds about 2·N·c·(1+m)/m² ≈ 0.3 mm in focus (c = 0.03 mm), less
than a sixth of our 2 mm gap (38r), so a bead touching the top glass and dye on the bottom
cannot both be sharp. A point brighter than its surroundings is spread into the aperture's
disc, which only reads as a bright disc in linear light. *Today:* depth of field is a
screen-radius mask and a five-tap cross, its circle from the dye's opacity (38q). *Build:*
this is 38q and 31f-3's Macro 1:1 made concrete for the closeup: give each drawn thing its
depth in the gap (the bottom and top dye layers, a bead's or bubble's centre, a particle's
height), a Focus dial that moves the focal plane through the gap, and a disc kernel of
radius A·|z − z_f|/z_f on linear light so glints become discs. Built under 38q, not beside
it. *Measure:* 31f-3's DoF law within 10 % in the lab, and a glint's disc at the radius the
law gives for its depth.

## 47e. Sparkle: microbubbles and mica that show the flow (M)

*Seen:* pin-point glints scattered through the liquid; specks that light up along the
currents. *Physics:* a bubble far smaller than a cell is a convex mirror: it returns a tiny
image of the light source, a glint of the same brightness whatever its size. Platelets of
mica or pearl pigment (rheoscopic fluid, the classic flow-visualisation liquid) turn in the
flow (Jeffery orbits) and spend most of their time aligned with the shear, so they flash
where they tilt to the mirror angle and draw the flow's structure as a shimmer. *Today:* the
bubbles are cell-scale and up; H1's particles carry dye, not reflectance; mica appears in
the plan only as pigment colour. *Build:* a Sparkle population (microbubbles, or mica as a
bottle additive) riding H1's particle machinery, each with an orientation taken from the
local strain's stretching axis, reflecting the closeup's softbox (Light Play, 38h-7) by
Fresnel at its angle; drawn as points, and as discs through 47d. *Shortcut, named:* the
orientation is quasi-steady (the stretching axis), not an integrated Jeffery orbit; an item
to integrate it if the shimmer reads wrong. *Measure:* glint count follows the population,
and in a shear flow the mica's brightness correlates with the strain's direction as the
mirror law predicts (lab).

## 47f. A stir bar: the magnetic stirrer's vortex as a tool (S)

*Seen:* dye wound into helices and spirals by a vortex. *Physics:* a magnetic stir bar
spinning under a dish drives a vortex: near the bar a solid-body core, outside it the
velocity falling as 1/r (a Rankine or Burgers vortex), with dye stretched into a
logarithmic spiral whose arms thin as they wind. *Today:* Spin (§22) turns the whole dish; no
tool makes a local vortex. *Build:* a Stir tool (and a cord) placing a rotlet at a point
with a core radius and a rate, ramped up and down as a real stirrer is; MIDI-learnable, on
the desks and the phone. *Measure:* the azimuthal velocity against the Rankine profile within
10 % in the lab, and the dye spiral's arm spacing against the rate.

## 47g. A drop on a thin layer: Marangoni spreading, fingering and bursting (L; owner's call)

*Seen:* a drop lands on a thin film and spreads into a front with fingers, sometimes into a
mesh of pores. *Physics:* solutal Marangoni flow: a drop of lower surface tension (alcohol,
soap, solvent) pulls the surrounding surface away, the film thins behind the front and
fingers; an alcohol and water drop on oil can burst into hundreds of droplets (Marangoni
bursting); a thin evaporating layer breaks into Bénard-Marangoni cells whose size is set by
its depth. *Today:* Marangoni forces exist in the solver (soap, oil, capillary passes); the
painted cells were retired at the owner's word ("No I don't want cells", 2026-10-29, 33g-3).
*Build, if wanted:* a "drop on a thin layer" pour that lets the real Marangoni term spread
it, with the layer's depth as the dial that sets the finger and cell size. Cells that come
from the physics are not the painted ones; whether to have them at all is the owner's call.
*Measure:* spreading radius against Marangoni scaling in the lab (r ∝ t^(1/3) for a surfactant on
a thin film, after Jensen and Grotberg; t^(3/4) on a deep layer).

## 47h. Time-lapse recording (S)

*Seen:* a slow reaction of five to ten minutes shown in seconds. *Physics:* nothing changes;
a time-lapse samples real time sparsely. *Build:* a Time-lapse rate on the Record button (one
frame every N seconds of show time, the solver untouched), on the desk and the phone.
*Measure:* the file's frame count against duration over N.

## 47i. Point lights behind the dish, seen through the beads (S; after 47d)

*Seen:* glass spheres holding small inverted images of a field of coloured points, with
out-of-focus discs behind. *Physics:* a sphere is a ball lens (focal length nR/(2(n−1)) from
its centre) that inverts what lies behind it. Our beads already invert the plate (`dropCam`,
`droplens`). *Build:* a ground of point lights under the dish in the closeup, which the beads
and bubbles image, and which 47d blurs to discs. *Measure:* `droplens`'s inversion lines on a
point ground.

## 47m. Gear: a small kit to film real references (owner's call, not code)

The realism rule asks for the real phenomenon before each build; three of the items above
are easiest to judge against a real dish filmed on the owner's own desk. A kit, cheapest
first: a 365 nm UV torch (not 395 nm, which spills visible violet), a few 90 mm glass Petri
dishes, highlighter ink and tonic water (fluorescent, household), black velvet, a small LED
light pad; then, if wanted, a clip-on macro lens for the iPhone, or a 90 to 100 mm f/2.8
macro lens on a camera, on a copy stand. The artist's own kit, per the films' descriptions:
a full-frame camera with a 100 mm macro lens, later a 6K cinema camera, UV lights and
fluorescent materials, 3 inch and 90 mm Petri dishes, acrylic paints, inks and dyes, glass.
Filming the kit is a `watch` pass (`npm run watch`) that sets each item's bar.

## 47w. Found doing this: the watch tool keeps the audio and stops (S)

On a YouTube download the watch tool's URL path left the video and audio as two files,
unmerged, then picked the audio file and stopped (found 2026-11-11 on the owner's Mac; they
were merged by hand to go on; the cause was not found). Make `scripts/watch.mjs` ask yt-dlp
for a merged file (or merge the pair with ffmpeg itself) and refuse a file with no video
stream with a message that says so. *Measure:* `npm run watch -- --selftest` plus a line
that hands it an audio-only file and reads the refusal.

## Order

47a-1 first (the cheapest fix for the photograph's serrated, soft closeup), then 47b (one
lighting term on the bend the plate already computes, the biggest change to the look for
its size) and 47j (caustics, which the films watched over time showed to be most of the
picture, and which 47b's dark field shows best), 47c, 47d (with 38q), 47a, 47e, 47f; 47g,
47h and 47i when wanted; 47w whenever the watch tool is next touched. Each its own thread
and PR.
