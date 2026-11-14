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
round; they were watched later in the owner's own Chrome (below). What the descriptions say, in their own words: "Micro chemical
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
(47c). Then two more of his on YouTube: *Streams II* (a re-upload, 3:24) and the official
Mikky Ekko video *Pull Me Down* (3:28, credited to him and a co-director); a third, TR/ST's
*Iris*, is a song over one still (he made its cover) and was set aside. *Streams II*: near
black 25 %, motion median 1.35, calm 60 %, takes of about 7.5 s joined by dissolves; it is a
soap film filmed close, pastel high-order interference bands behind a sharp domed meniscus,
fine zigzag bands relaxing into a few broad ones over about 6 s and back, almost nothing
breaking, the whole field turning orange to teal to lilac as the film thins (§32's film,
seen at the closeup's scale; its thick, washed-out higher orders and the steep zebra where
the thickness changes fast are what our film needs to reach). *Pull Me Down*: near black
31 %, motion median 1.77, calm 61 %, very shallow focus (47d); in its longest take a black
channel of ink pinches into a row of beads in about a second, the beads then throw fine
tendrils into dark stars and cells with pale droplets drifting between (47k), and the
motion settles from its peak to a steady low within about 2 s. Sheets and timelines:
`~/chromaglass/scratch/davy/` on the owner's Mac.

**The Microlab films themselves, watched in the page (2026-11-13).** Ten of the eleven,
played in the owner's own Chrome on vimeo.com (no bot check there) and read frame by frame
into a canvas in the page: 24-frame sheets, a centre slit-scan, and per sample the mean
luma, saturation, share near black, hue spread, motion (mean luma change over 1/24 s on a
96×54 copy) and edge detail at 384×216 and at 96×54 ("fine" and "coarse"; their ratio is
how much detail sits below a coarse grid). Read across the ten: near black 20 to 90 % (the
glass and sphere films 80 to 100 %); saturation 0.7 to 0.85 in the fluorescent films and 0.3
to 0.45 in the glass ones; azure and blue are the leading hues in eight of ten, with
magenta, rose or amber as a second light in five; fine over coarse is 2.2 to 3.1 in every
film. Motion splits two ways: *Rebirth*, *Forms IV* and *Fryars* drift (median 0.004 to 0.006,
calm about half the time), *Underworlds*, *III* and *At0m* churn (0.02 to 0.04, calm under
5 %). What recurs: cellular networks in five (*Rebirth*'s core bursting into a mesh that
drifts apart as fragments, *Underworlds*' dense foam of cells with glowing cores, *Fryars*'
thin-rimmed polygons with sparkles along the rims, the rings of *II* breaking into fine
cells: 47g); suspended glitter or specks in four (47e); big out-of-focus discs and
starburst spikes on speculars from a stopped-down lens (*Forms IV*, *III*: 47d, 47i); a
second coloured light raking in from one side over the blue glow (*II*, *Underworlds*:
47b's Rheinberg); a top-down vortex with concentric rings (*At0m*: 47f); clear glassy
strands glinting gold (*III*); a left-right mirror laid on in the edit (*IV*); and a side
view through a tank (*Gravity L1*: 47n). Numbers and sheets:
`/mnt/project-files/macro-davy-evans/microlab-watch/` in the project's shared files.

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

~~**47b-1** A side lamp~~ (shipped; story in `docs/plan-shipped.md` §47e-47d-1-47b-1): Side Light, Side Colour and Side Angle, a second coloured
lamp raking in low from one side over the glow (the Microlab films' amber or magenta over
blue), lighting the pigment by single back-scatter, the glasses' slopes by Fresnel and the
glitter by the mirror law, falling off by the inverse square across the stage (`npm run glint`).

- **47b-2. Open: the side lamp casts no shadows.** Its light reaches every height of the
  dye undimmed: a thick blob should shade the dye behind it from a lamp this low, and the
  lit side of a front should be brighter than its far side by the dye's own transmission
  along the slanted ray. Needs a short march through the dye toward the lamp (four to eight
  taps along `sideRay`), in the lens pass. *Measure:* in the lab, dye behind a dense blob on
  the lamp's line reads at least 30 % darker than the same dye with the blob moved aside.
- **47b-3. Open: the lens pass on every picture.** Projector sources drawn by `drawSource`
  and the kaleidoscope's copy are drawn without it, so glitter and the side lamp vanish when
  a source is up. Run `PlateGlint` after those paths too. *Measure:* a `glint` line with a
  source up.

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

~~**47d-1** The glitter's depth of field and the iris's stars~~ (shipped; story in `docs/plan-shipped.md` §47e-47d-1-47b-1): each flake has
its height in the gap; the lens (magnification 0.27 × zoom on a full-frame sensor, Lens Stop
f/1.4 to f/22, focal plane at Projector Focus) draws it as its aperture's disc, a hexagon
from a six-bladed iris stopped down and a circle wide open, of diameter |z − z_f|·gap·m/(N(1+m)),
in linear light; and stopped down, its Airy core grows (1.22 λ N (1+m)/m, per colour) and
six diffraction spikes reach out from it, fading as the flake leaves focus.

- **47d-2. Open: discs and stars on every highlight.** Only the glitter is drawn through the
  lens; the beads' and bubbles' speculars and the softbox's glints on the dye stay sharp and
  starless. The whole-plate disc kernel above is the rest of 47d.

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

~~**47e** Sparkle, its glitter half~~ (shipped; story in `docs/plan-shipped.md` §47e-47d-1-47b-1): Glitter puts up to 32,768 polystyrene
flakes in the liquid, riding the dye's own flow at their height in the gap (Poiseuille's
profile), turning in integrated Jeffery orbits (the shortcut above is not taken), settling
by Stokes and lying flat where they land, and flashing where the side lamp or the softbox
meets the mirror angle; dark specks on a lamp ground.

- **47e-1. Open: microbubbles.** The other half: bubbles far smaller than a cell, each a
  convex mirror returning a glint of the same brightness whatever its size, beside the flakes.
- **47e-2. Open: two shortcuts in the flakes.** A flake's orbit constant (which of Jeffery's
  closed orbits it is on) is stood in for by a fixed lean, so every flake tumbles in the
  flow's plane; and a flake that has lived 40 to 160 s fades out and is born again elsewhere,
  standing in for a stir lifting it off the floor. Integrate the orbit constant from the
  flow's vorticity, and lift landed flakes by the shear at the floor. *Measure:* in a shear
  flow the share of flakes flashing settles to the closed-orbit average, and a stirred plate
  lifts what a still one lets lie.

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

## 47k. A thread of ink or oil pinches into beads, then throws tendrils (M)

*Seen:* a channel of dark ink pinches into a row of beads in about a second, and each bead
then spreads fine tendrils into a star. *Physics:* the capillary (Rayleigh-Plateau)
instability: a liquid thread is unstable to waves longer than its circumference, the
fastest at about 9 radii, and breaks in a time near sqrt(ρr³/σ) (slower by the viscosity
ratio, after Tomotika, when one liquid is inside another); between glass plates only a
thread narrower than the gap can bead, since a strip wider than the gap has no curvature to
lower. The tendrils are solutal Marangoni spreading from each bead (47g's physics on a small
scale). *Today:* §20 names the same beading for the lace's ligaments ("the dotted rows");
nothing says whether a thin thread of oil or ink in the bulk beads at all on our plate.
*Build:* first measure it: lay a thread of each width in the lab and see whether, how fast
and at what spacing it breaks; then, if it does not, add the gap-direction curvature to the
capillary pass so threads narrower than the gap bead at the Rayleigh-Plateau wavelength.
*Measure:* bead spacing 9.0 r within 15 %, breakup time against the Tomotika rate for the
two liquids' viscosity ratio, and a strip wider than the gap stays whole.

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

## 47n. A side view: a falling thread and a gravity current in a tank (L; owner's call)

*Gravity L1* films a tank from the side: fluorescent dye falls as a jet that stretches into
one thread over about 40 s, lands, and spreads along the floor as a gravity current whose
head curls into filaments, with glitter floating in dark water (near black 76 to 83 %, motion
median 0.013, a jump to 0.029 at the landing). The owner asked for it on 2026-11-13 and chose
its own solver over standing the plate up (the plate's glass drag eats the momentum a jet and
a curling head need).

~~**47n-1** The tank~~ (shipped; story in `docs/plan-shipped.md` §47n-1): Tank, a vertical
slice of water with heavy dye falling from a nozzle (`src/lib/tank.ts`, `src/gpu/tank.ts`,
drawn in the plate's place by `src/gpu/tankDraw.ts`), with Feed, Dye Weight, Nozzle, Drain
and Glow Hue on the desk, the phone and MIDI; a held finger carries the nozzle.
`npm run tank`, `npm run tankgpu`.

- **47n-2. Open: momentum carried with less smearing.** The momentum is carried
  semi-Lagrangian, which smears it by about u·dx/2, about three times water's own viscosity
  at a centimetre a second on 0.94 mm cells: the slice behaves like slightly thicker water,
  and the lock exchange's floor front reads 0.42 of √(g′H) where experiments read 0.44 to
  0.48. A MacCormack or BFECC carry would sharpen the gravity current's curling head; the
  reference changes first, then the GPU, held by `tankgpu` as now. (Shortcut named in
  `src/lib/tank.ts`, item 5.)
- **47n-3. Open: a finger's place on the screen, exactly.** A held finger carries the nozzle
  through the plate's hold coordinates, turned back to the screen assuming its long side is
  the width and the camera unzoomed and unturned (`gpu/tankPlate.ts`, `screenX`). Hand the
  solver the screen's own mapping so a portrait screen or a zoomed camera lands the nozzle
  under the finger. A screen wider than 16:9 is off too: the tank keeps its shape and fills
  the height there, with black water at the sides (`gpu/tankDraw.ts`), so the finger's x wants
  that letterbox taken out as well.
- **47n-4. Open: a Gravity Tank look.** Tank is a switch on any look today. A built-in look
  needs its plate entries (`presetPlate.ts`: dyes, tools, liquids) and a seed case in
  `sim/fluidSimulation.ts`, which is over its size ceiling, so the seed goes in a module
  beside it first. Its cords: the bass on Feed, the kick on Dye Weight a little.
- **47n-5. Open: the rest of the film in the tank.** A rod, not a sheet: the slice is 2D, so
  the thread thins as a ∝ 1/v where the film's round jet thins as (Q/v)^½ (a 3D tank, or an
  axisymmetric solve about the jet's axis, replaces it). Glitter (47e) and the side light
  (47v-7's red rake) carried and lit in the tank once they exist; two or three dyes of
  their own colours and weights, each a concentration the flux form carries.
- **47n-6. Open: the dish's solver rests while the tank shows.** With Tank up the plate's
  own solver still steps under it, unseen. Skipping it would hand the tank the frame's
  whole budget; it has to come back where it was when Tank goes off. Touches and pours land
  on that hidden plate too (a pour's dye, a magnet, a blow), so a tap meant for the tank
  changes a look nobody sees until Tank goes off: route them to the tank (a tap drops a bead
  of dye where it lands) or hold them while it shows.
- **47n-7. Open: a real tank's stir, so the jet is not a mirror.** Filmed on the Mac
  (2026-11-13), the flow is mirror-symmetric about the nozzle for the first 45 s: nothing in
  the slice breaks the symmetry but float rounding, which takes that long to grow into the
  buckling a real jet shows within seconds. A real tank is never still (the pour's own
  wobble, a fraction of a degree of temperature): seed the water with a small, physical
  disturbance (velocity noise of a few µm/s, or the nozzle wandering by a tenth of its bore),
  in the reference first, the GPU after, and let `tankgpu` measure the left-right difference
  growing where today it stays at rounding.

## 47w. Found doing this: the watch tool keeps the audio and stops (S)

~~**47w-1** The download half~~ (shipped; story in `docs/plan-shipped.md` §47v-47w-1): the
cause was yt-dlp handed a bare `ffmpeg` as `--ffmpeg-location`; the tool now passes the full
path, joins a picture-and-sound pair itself and refuses an audio-only fetch.

~~**47w-2** Dissolves~~ (shipped; story in `docs/plan-shipped.md` §47w-2-47v-2-47v-3): a run
of raised change whose ends differ by a cut's worth, whose frames are mixes of its ends and
whose new picture the take never showed (`scripts/watchcuts.mjs`); 12 found in the Joshua
Light Show film, each a superimposition on the sheets.

- **47w-3. Open: *Streams II* again.** The film that showed the miss is on the owner's Mac
  (`~/chromaglass-films/watch/`); watch it once with this tool and write its cuts a minute
  beside the 7 counted by eye. Needs a thread with the Mac connected.

## 47v. Watching any link: a design read, a physics read and the techniques (S–M)

~~**47v**~~ (shipped; story in `docs/plan-shipped.md` §47v-47w-1). Asked 2026-11-12: point
Claude at any video or animation and get meaningful feedback on colour and form, a physics
read, and the techniques used, and judge our own visuals the same way.

~~**47v-2** A reference library~~ and ~~**47v-3** the physics read's real-footage bars~~
(shipped; story in `docs/plan-shipped.md` §47w-2-47v-2-47v-3): `--keep`, `--refs` and `--vs
<name>` over `/mnt/project-files/references/` (`scripts/watchrefs.mjs`); two performance films
read and kept, their numbers in `REAL_SHOWS` (`scripts/watchphysics.mjs`) and printed beside
each band.

- **47v-4. Open: the third real show.** Tried 2026-11-12 with Liquid Light Lab, fetched on the
  owner's Mac, and none of their films makes a plain row. Their own films (*Melt Your Face
  Vol. 1*) run the dish camera through a video mirror and colouriser: flow 14.5, carried
  0.27, turnover 0.8 s, lifetime 0.2 s, spectrum −2.37, mirror symmetry 0.69, colour flips
  read as a burst of cuts at 3:33. That is their look, so it is kept in the library
  (`lll-melt-your-face-1`, for `--vs`) and left out of `REAL_SHOWS`, whose rows are filmed
  oils. Their concert videos lay photographs of the band over the oils. Their set behind
  High Time at Brooklyn Bowl (2024) is filmed from the crowd: the screen is a strip about
  250 pixels wide between the truss and the band's heads, and read there it gives carried
  0.03, turnover 0.5 s and a lifetime longer than the clip, which is the stage lights and the
  camera, not the oils. Still wanted: a projected show filmed square-on and close, or a dish
  camera with no video effects (the owner's own rig filmed is the surest).
- **47v-6. Open: a crop too small to read says so.** `--crop 0.05,0.33,0.9,0.13` on the
  Brooklyn Bowl film decoded to 320×26, and the physics read printed dashes ("0% of textured
  blocks matched") with no reason. When the decoded crop is under about 64 rows, print that
  the flow read needs a taller crop, and a selftest line for it.
- **47v-7. Open: watching where the file can't be fetched.** Vimeo refuses the cloud and a
  headless browser, and a recording saved by the owner's Chrome lands in Downloads, which a
  thread may not open. What worked (2026-11-13): read the frames in the page itself, in the
  owner's Chrome, stepping the video by seeks (live playback skipped ahead and restarted
  under the per-frame work) and taking a pair of frames 1/24 s apart for motion. Make that
  a script the watch skill keeps (`scripts/watchpage.js`, pasted into the page), printing the
  same names as `watch.mjs` so `--vs` can compare, with the run's own numbers checked
  against `watch.mjs` on one clip both can read.
- **47v-5. Open: carried on real footage.** Real shows read carried 0.13 to 0.19 where the
  synthetic texture slid reads 0.97: grain, a camcorder's noise in the dark, the lamp's hot
  spot and superimposed loops all count as change the flow does not carry. Measure the
  noise floor from the clip's own still samples and take it out of the raw change, so a
  real plate's transport reads as transport; until then the read prints the real range and
  the in-place guess fires only under it.

## 47y. Found doing this: Poster 1969 against a real overhead projection (M)

Liquid Light Lab's *Quick Tutorial* (cropped to the projected disc) against our *Poster 1969*
take from 2026-11-11, by `npm run watch -- … --vs`:

- **Cells.** Theirs: 22 bright forms a frame, elongation 0.87: the oil beaded into round cells
  on the water, dozens across a pool. Ours: 12, elongation 0.66. Immiscible break-up and
  coalescence at the plate's own scale; see 33f and 38r for the drop physics.
- **Rims.** Theirs: each cell outlined by a thin dark line (light refracted away at the
  meniscus), soft colour washes between: edge width 2.2% of the width. Ours: soft outer dye
  edges (3.9%, 1.8× softer) and hard combed striations inside each dye body (flow-line
  coherence 0.75 against 0.57). 47j caustics and 38h's shadowgraph carry the rim; the
  striations want a look at the dye's own stretch and diffusion.
- **Ground.** Theirs: dark around the cells with the lamp's hot centre (luminance 0.36);
  ours: a white ground (0.63). A look's choice, but the projector's falloff is optics.
- **Turnover.** Ours 2.6× brisker (5 s against 13 s to carry a form its own size): a viscous
  pool moves slower.

## 47z. Found doing this: a crowd of oil drops in vivid colour, against our drop looks (M–L)

The owner sent a screen recording (2026-11-12) of a Liquid Light Lab post, oils on an overhead
projector with an oscilloscope's figures mixed over them, and asked for the physics of the
drops and bubbles and for its vivid colour (the oscilloscope is not wanted). Kept in the
library as `lll-oscilloscope-vectors` (`npm run watch -- --refs`); cropped to the video,
`--crop 0,0.2,1,0.64`. Read against our closest takes from 2026-11-11 (`--vs`, 10 s windows,
24 frames):

| | theirs | Splodascope | Macro Bead | Crowd Plate | Poster 1969 |
|---|---|---|---|---|---|
| separate forms a frame | 63 | 12 | 25 | 17 | 11 |
| elongation (1 round) | 0.75 | 0.60 | 0.62 | 0.49 | 0.66 |
| edge width, % of width | 1.38 | 2.90 | 1.04 | 3.28 | 3.91 |
| colourfulness | 137 | 43 | 47 | 125 | 138 |
| coloured share of the frame | 0.99 | 0.39 | 0.34 | 0.80 | 0.66 |
| hue spread (0 one hue) | 0.08 | 0.06 | 0.31 | 0.39 | 0.40 |

What the frames show: hundreds of round drops from specks to a tenth of the frame, warm
(red, orange, yellow) on a dark blue or violet water, each a lens with a bright core and a
thin dark rim, a few drops inside drops, and fingers of yellow pinching into chains of
beads. Their pace is not a target: a social edit of short clips (17.5 cuts a minute) whose
turnover and lifetime (0.4 s) are under every real show's. Some of their saturation is
likely the camera and video mixer's gain; the plate's should come from the dye and the light.

The physics, in the order to build (each its own thread and PR):

- ~~**47z-1. Colour: a drop takes the water out of the light's path.**~~ (**shipped**, this PR;
  story in `docs/plan-shipped.md` 47z-1, with 28i-7b and 28k-5): a part-oil cell's light is the two
  liquids' side by side (`packDyeBodies`), a look's lay puts each drop's colour in its own oil
  (`addOilDensity`); `npm run dropcolour`. Found doing it, open:
  - **47z-1e. Splodascope's water: cobalt was tried and is darker.** Filmed on the owner's Mac
    (2026-11-13, 20 s takes): main's pale water read colourfulness 131, coloured 0.87, luminance
    0.42; the photograph's cobalt with this PR 62, 0.51, 0.20, the frame 0.40 near black. The drops
    kept their colours with no browning, but a full wash of cobalt passes too little of the lamp,
    and the orange ferro reference's vivid colour is on a bright ground (luminance 0.52). Kept pale.
    A thinner cobalt wash (the photograph's water is a thin layer) is the thing to try next, filmed.
  - **47z-1a. Lava Lamp and the other lays.** Splodascope and Clock Glass lay each body's colour
    as the oil's own; Lava Lamp still lays its wax's colour as plain dye, so the rim's share goes
    to the water by the oil under each cell, and a faint halo of the wax's colour is the water's.
    Left as it was because the owner had just approved the lamp's look (2026-11-12); try it in the
    lab against `npm run lavawax`, and any other look that lays oil with a colour.
  - **47z-1b. The averaging's path and the cells between.** The pack averages the light at the
    composite's rest-gap path (DYE_PATH, 2.8), not the pixel's own gap (gapScale, 0.3 to 3 times),
    and the composite's bicubic still interpolates absorbance between two cells, so a drop's edge
    keeps a band about one cell wide where red and cobalt multiply. Named shortcuts: the true
    sum is per pixel, which needs the oil's share in the composite, and its sixteen textures are
    full (`view0` is packed to the bit); a seventeenth needs a binding freed first.
  - **47z-1c. A rebuilt solver forgets whose colour is whose.** A lay's labels go across once,
    with its flush; a solver rebuilt before the plate has come back (`restoreSeed`) or carried
    to a new grid (`takeOver`) starts the oil's share from the oil under each cell again, as
    before this item. Carry the share with the dye where the carry allows.
  - **47z-1d. A drop inside another drop goes dark where they meet.** Splodascope's compound
    drops (a hole in one colour with another drop in it): once the ring of water between them
    thins, the two oils are one phase holding both colours, and they multiply. Real ones keep a
    water film between them: 47z-3's films, or a second oil phase.
- **47z-2. Drops of every size, from a stir.** A real oil layer stirred or swirled breaks into
  a crowd: a drop sheared past the critical capillary number (Ca = μ γ̇ R / σ, near 0.5 for
  equal viscosities) stretches and splits, its pieces split again until each is under the
  critical size, so the sizes spread over a decade or more; threads between them bead at the
  Rayleigh–Plateau wavelength (**47k**). Whether that happens on our plate depends on the
  tension in real units and the capillary cap that bites at the moment of break-up (**38e**).
  Specks under three cells are the beads' (**28k-3**). *Build:* first measure: stir a pool of
  oil in the lab at three rates and count the drops and their sizes after five seconds; then
  fix what stops it in that order (38e's cap, 47k's gap curvature, 28k-3's specks).
  *Measure:* the count rises with the stir rate, the largest surviving drop's radius falls as
  σ / (μ γ̇) within 30% (the free-shear law; a drop squashed in the gap may follow a
  confined variant, which the build PR names before it measures), and the size distribution spans at least a factor of ten.
- **47z-3. Drops that touch and wait.** A crowd stays a crowd because the water film between
  two drops must drain before they merge, a time that grows with the drop's size and the
  viscosity; Film Hold holds a film until pressed, which is the threshold without the timing.
  This is **28k-2** (Reynolds' drainage, μR²/(gap·σ)-scaled, and a rupture drawn from it).
  *Measure:* after a stir, the count halves over a time that scales with R² within 30% across
  two drop sizes, not at once and not never.
- **47z-4. Each drop a lens.** A drop's curved meniscus bends the light: the projected drop
  has a bright core and a thin dark rim where light is turned out of the lens's aperture.
  That is **47y**'s rims, **18c-4** (lens or film by the spreading coefficient), **47j**
  (caustics) and **38h**'s shadowgraph; our edges are 1.7 to 2.4 times softer on the drop
  looks (Macro Bead's beads already read 1.04%). *Measure:* edge width on Splodascope's take
  under 1.6% of the width, from the optics, never a drawn outline. Found in 47z-1: the look's
  dark rims today are two stand-ins, the boundary line (Boundary Contrast, a colour step drawn as
  a deflection, though a dye moves water's index by almost nothing) and Edge Relief's slope line,
  each four or five of the solver's cells wide at a drop's rim; with both off a red drop's rim in
  cobalt is no darker than the water (`npm run dropcolour`). This build replaces them at an oil
  rim with the oil's own index step (18e-2's deflection by ∇OPL).

Two more recordings the owner sent the same evening, both macro films from Cosmodernism's
page, add one build and a note:

- ~~**47z-5. A packed foam whose films meet at 120°**~~ (shipped; story in `docs/plan-shipped.md`
  §47z-5): the look **Foam Cells**, a packed emulsion laid pressed across the dish whose junctions
  the oil's tension turns to Plateau's 120° (`npm run foam`). Asked again 2026-11-13 with the
  Microlab films' cellular networks ("Ok let's do this all"). What it found, still open:
- **47z-6. A crowd that packs itself.** Foam Cells is laid pressed; a crowd of round drops does not
  press itself into polygons, because nothing presses it: in open water a held crowd has room to
  stay round (Splodascope's bowed glass gathers it, but at 0.45 not past touching in six seconds).
  Real foams are pressed by gravity draining them, or held by films that stick (an attractive
  part of the disjoining pressure, as in adhesive emulsions, where the film's tension is under
  twice the interface's and drops meet at a contact angle). The second was tried here (a push
  falling as e^(−h/5) against Film Hold's e^(−h/2.5), and the same as a chemical potential): the
  drops did pull together, and then merged through the film at every strength from 0.3 to 1,
  the potential by seeding oil in the film. The field cannot hold a film under about four
  cells (28k-2 (a)), and the attraction brings the faces there faster than the hold answers.
  Needs a sharper film first (a film carried as its own thin field, or a phase field per drop
  colour as multiphase foam solvers do); then sticky films, or a gravity that drains a raft
  standing on a tilted plate.
- **47z-7. Films that pop by draining, not only when pressed.** Foam Cells' films hold until a
  kick presses one past the hold; a real foam coarsens as films drain and rupture by chance,
  the small cells losing to the big (von Neumann's law in 2D: a cell's area changes at a rate
  set by its number of sides less six). That is 47z-3's drainage time per film, then a check
  that cells under six sides shrink and over six grow.
- **47z-8. Smaller cells.** A cell must be about fifty grid cells across for its films (four
  cells each, the field's edge) to leave under a sixth of the dish water; under that the cells
  round up into a wet crowd (lab: twenty across, fill 0.69, 68 cells to 33 in twelve seconds).
  So Foam Cells has about a seventh of the plate per cell at 384² and a ninth at 512², where
  the macro film has twenty or thirty. Thinner films (28k-2 (a)) give smaller cells; and with
  them `npm run foam`'s 120° bar can go toward the nine in ten first proposed, since the reader
  is exact only where a film runs straight for seven cells.
- **The magnet beside the drops.** `cosmo-ferro-maze-drops` (`--crop 0,0.22,1,0.53`):
  ferrofluid in a thin cell as a labyrinth where it is thick and a lattice of fine dots at a
  drop's thin rim, beside large orange drops; stripes against dots by the fill and the
  magnetic Bond number is **38d** (the dipolar sheet), §09 the rest. Its vivid colour
  (colourfulness 114) is on a bright ground (luminance 0.52), so 47z-1's measure is the
  colour itself, not a darker ground. Its white crescents are a ring light reflected in the
  domed drops: a camera over a lit dish, not a projection (§09's note on speculars, 47e).

Each lands as a watched take against its reference (`--vs lll-oscilloscope-vectors`, `--vs
cosmo-packed-foam-cells` for 47z-5), the
number it moves printed before and after.

## Order

47a-1 first (the cheapest fix for the photograph's serrated, soft closeup), then 47b (one
lighting term on the bend the plate already computes, the biggest change to the look for
its size) and 47j (caustics, which the films watched over time showed to be most of the
picture, and which 47b's dark field shows best), 47c, 47d (with 38q; 47d-1 shipped), 47a, 47e (its glitter half shipped; 47e-1, 47e-2), 47f, 47k; 47b-2 and 47b-3 after 47b-1; 47g,
47h, 47i and 47n when wanted; 47w-3, 47v-4, 47v-5, 47v-6 and 47v-7 whenever the watch tool is next touched; 47y
as each of its bullets' items comes up; 47z-1, 47z-2, 47z-3, 47z-4 in that order (the owner asked
for the drops' physics and their colour, 2026-11-12; ~~47z-5~~ shipped early, 2026-11-13, as Foam
Cells), then 47z-7 after 47z-3, 47z-8 and 47z-6 after 28k-2 (a). Each its own thread
and PR.
