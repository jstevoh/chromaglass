# 20. Lace and holes: a pale film torn open over colour

Asked 2026-09-28. The owner sent a still from another performer's liquid light show
and asked what it would take for the plate to look like it.

What the still shows:

- a pale layer, white with faint pink and lavender in it, torn into a **lace** of holes
  from a pixel or two to a sixth of the frame, many of them stretched along the flow
  into slits;
- rows of small **dots** along the lace's edges and ligaments;
- a thin **dark line** round every hole and every edge of the lace, and edges that are
  sharp rather than soft;
- flat **discs**, round and translucent, with a faint darker rim, sitting over both
  the lace and the colour;
- behind it all, **dense colour fields** (orange, red, indigo, a little teal) in
  streaks, going black where two dense dyes overlap.

This is not batch 2's lacing, which paints hair-thin filaments along dye boundaries.
Here the pale part is a liquid of its own, and the holes are where it has come apart.

## What each feature is, physically

**The pale lace is clear liquid under the lamp, not white paint.** On a projector the
lamp shines through the dish, so a region with no dye in it throws the lamp's own white.
A milky or white-pigmented liquid would throw grey or dark, because the light it
scatters misses the lens (18j). So the lace is a clear liquid (most likely an oil)
that fills most of the gap between the glasses, with a thin layer of dyed water left
under it: that thin layer is the pink and lavender tint. Where it has torn, the dyed
water spans the whole gap and the colour shows at full strength.

**The holes are a thin film dewetting.** A liquid film thin enough to feel the glass
(well under a millimetre) is only metastable. Where it is thinnest, or where a speck
of dust or a drop of solvent lands, it ruptures, and the hole grows as surface tension
pulls the film back. That is dewetting (Reiter 1992; Brochard-Wyart and Daillant 1990).
Its signs are all in the still:

- **Holes of many sizes.** Holes open at different times and grow from their own
  moment, so the early ones are large and the late ones small. A film's spinodal
  spacing also grows as the square of its thickness (for van der Waals forces), so
  thin parts of the film tear fine and thick parts tear coarse.
- **The lace.** Neighbouring holes grow until the film between them is a network of
  ligaments.
- **The dotted rows.** A ligament is a thread, and a thread breaks into a row of drops
  (Rayleigh–Plateau). So does the ragged rim at the film's edge.
- **Slits.** The dish is flowing while the holes grow, so the shear stretches them.

A drop of alcohol or a surfactant makes holes on purpose. It lowers the surface tension
where it lands (about 22 mN/m for alcohol against 72 for water), and the film is pulled
away from it (Marangoni flow). Performers use exactly this gesture.

**The dark lines are refraction, not ink.** Oil (n ≈ 1.47) and water (1.333) differ,
so where the film's thickness changes steeply, the optical path through the gap
changes steeply and light is bent out of the projector's lens. That draws a hairline
at every edge; a slight defocus adds a bright partner (a shadowgraph). This is 18e.
The edges are sharp because two immiscible liquids keep a real interface, where
dyes in water would blur.

**The discs are flat drops of oil in the gap.** A drop wider than the gap is squashed
into a pancake: flat in the middle, and curved only at the rim. So only the rim bends
light out of the lens, which gives the faint dark ring. The body tints what is behind
it by absorption, because the oil is lightly dyed or the water under it is thinner.
They sit over the lace, so they are in the other layer (the front plate) or against
the other glass.

**The colour fields are dye by absorption.** Dense dye through the full gap is deep and
saturated, and two dense dyes overlapping go black (subtractive mixing). The fine
streaks are dye drawn out along the flow (18h).

**An alternative, to check against a video.** A mixture of oil, alcohol and dyed water
can also break up by phase separation as the alcohol leaves, with no film. The two can
be told apart in motion. Dewetting holes appear one by one and each grows steadily
from its own start. Phase separation appears everywhere at once, at one size, and
then coarsens slowly (as t^(1/3)). A clip of this performer's show through the
`watch` skill would settle it. The plan below follows dewetting, which the still fits
best, and the prototype supports it.

## The prototype

`/mnt/project-files/lace/lace.py` (project files, not the repo) is a CPU prototype in
numpy on a 384² periodic grid. It checks that this physics makes the picture before any
of it is written in WGSL. The gap has depth 1. A clear oil film of thickness h lies
against one glass, and dyed water fills the other 1 − h. The film obeys the
thin-film equation:

    ∂h/∂t = ∇·(h³ ∇p) − ∇·J_M − u·∇h
    p     = −σ∇²h − Π(h) + (top glass)
    Π(h)  = K[(h_p/h)³ − (h_p/h)²]    (disjoining pressure; h_p a precursor film)
    J_M   = −k h² ∇Γ                   (film pulled away from a solvent Γ)

It is solved semi-implicitly (spectral) with the film conserved to the last digit.
Solvent drops land now and then, then spread and evaporate, and a slow stir carries
everything. The picture is Beer–Lambert through the gap: lamp × exp(−Σ εᵢcᵢ(1 − h)),
with the aperture loss and a shadowgraph term taken from the optical path
1.47h + 1.333(1 − h). Three flat oil pancakes are laid on top.

What it showed, at 2,000 steps:

- **The film tears on its own.** Nothing in the code draws a hole, a rim, a ligament
  or a dot. There are 76 holes, with diameters (in cells) of p10 1.1, p50 2.9, p90 16.4
  and p99 107: a hundredfold spread. The ligaments break into rows of drops along
  every edge.
- **The ground decides whether any of it shows.** The same state drawn the way the
  plate draws today (dye on a black ground) puts 0.0% of pixels near white, and the
  lace is black. Under the lamp, 10.1% are near white and the lace reads as the
  still's does. `today-lamp-refraction.png` shows the same state three ways.
- **The dark lines come out of the optics.** They appear with the aperture and
  shadowgraph terms, with no painted edge. At first they came out too heavy (lines 3–4
  cells wide), and they needed a narrower cone than the drops use. That is the
  question 18e already asks about `DROP_NA`.
- **It does not reach the still's stage.** In the still, the film still covers most
  of the lace and its holes are cut clean, with no raised rim. The prototype's film
  (a no-slip lubrication film, mobility h³) builds rims and retracts into a thin
  network before the holes are dense. Holes that open with no rim, growing
  exponentially, are the signature of a **viscous** film retracting on a liquid
  underneath: its own stretching viscosity resists it, not the glass (Debrégeas,
  Martin and Brochard-Wyart 1995, R ∝ exp(σt/ηh)). So the real film is thicker and
  more viscous than the prototype's (a heavy oil or a syrup), and 20c is the fix.

Pictures in `/mnt/project-files/lace/`: `reference-vs-prototype.png`,
`lace-over-time.png`, `today-lamp-refraction.png` and `lace-final.png`.

## Where the plate stands

| Feature | What the plate has | What is missing |
|---|---|---|
| White where there is no dye | Dye stored as absorbance; the gap bound in the plate pass | The lamp ground: 18b, shipped (#256) behind Lamp Ground; a look must turn it up (20a) |
| A film that tears | Clear Film (20b, #259): a thickness field with a disjoining pressure, dust and a solvent, tearing on its own | A viscous film (20c), and the film pushing the water (20b-1) |
| Rimless holes, slits | Flow shear; 18a's thin-gap flow (Thin Gap, on in every look since #248) | A viscous film (20c) on 18a's per-liquid mobility (18d) |
| Hairline edges | The projector's aperture law for drops and bubbles (`dropLens`, u*) | The same law applied to every edge: 18e |
| Flat discs | Drops flattened by the half gap (`DROP_HALF_GAP`); Oil Bodies; two layers | Large pancakes poured on the front layer, and tinted by absorption (18b) rather than glowing |
| Dense colour going black | Subtractive mixing in the solver | Shown only with the lamp ground (18b); streaks: 18h |

## 20a. A look on the lamp ground (depends on 18b)

Nothing below shows without it: under today's ground the lace is black. 18b already
plans the lamp as a per-look choice. This look is the first that must have it, so it
is a good first customer. **Check:** the prototype's white fraction measured in the
lab: a clear pool on the lamp ground throws at least 90% of the lamp, and the same
pool on the black ground stays the control.
**The ground shipped (18b, #256):** `npm run lamp` reads the clear pool at 100% of the
lamp and 0% on black. What is left of 20a is the look itself, on Lamp Ground 1.

## 20b. A clear film that tears (the thin-film equation)
**Partly shipped** (#259): the Clear Film is built behind `clearFilm` and checked by `npm run lace`. What is left from it, each its own item, is below. How it was found, built and measured is in [`docs/plan-shipped/20-lace-and-holes.md`](../plan-shipped/20-lace-and-holes.md), under the same number.

Left from 20b, each its own item:

- **20b-1. The film does not push the water.** It is passive: where it thickens,
  the dyed water's path is shorter in the picture, but the water is not displaced
  sideways and the Hele-Shaw flow does not see a narrower gap. The real film is a
  second liquid in the gap; on 18a's solver it is a change of the water's gap (as
  a press is), which 20c's first way does anyway. *A shortcut named for speed and
  scope.*
- **20b-2. The film's carry assumes the water's viscosity** (the Poiseuille profile
  across the whole gap). A heavy oil film moves differently; 20c replaces it.
- **20b-3. Cost unmeasured on a GPU.** Two carries and twelve substeps of two passes
  a frame on 384², with a reach of two cells in `filmUpdate`. Measure with `npm run
  stages` on the Mac; if it is over 0.4 ms, fuse `filmMu` into `filmUpdate` through
  workgroup memory, or a stabilised semi-implicit step with a few Jacobi sweeps
  (fewer substeps). A slow frame takes at most twelve, so the film runs slower
  rather than unstable. *Named as a shortcut: the film's clock dilates on slow frames.*
- **20b-4. The packed view is full.** All eight numbers and now the film share the
  one texture the display pass can still bind (sixteen textures). The next field the
  plate draws needs a new home: a device limit raised where the adapter allows, or
  the reactions moved to their own pass.
- **20b-5. Only the front plate has a film.** The back plate (two-layer looks)
  carries none: its solver is handed 0, because the display reads the film from the
  front plate's packed view alone. Clear Film is on the per-plate list (`PER_LAYER`),
  so aimed at the back plate it does nothing yet.
- **20b-6. A rung below 384² tears coarser.** The film's grid is the solver's there,
  and the lengths are in its cells; at 1080p a 384² cell is about three pixels, and
  the still's smallest holes are a pixel or two.
- **20b-7. The dust does not turn with the glass.** When the dish spins (§22) the
  specks should go round with it; they are fixed to the screen's plate coordinates.
- **20b-8. Alcohol on bare water.** It is a solvent only for the film; whether it
  should also drive the water's Marangoni flow (Soap Bursts) as soap does is open.
- **20b-9. The hole's edge is drawn between the film's texels.** On a 4K wall the
  edge is soft; 18e's refraction lines would draw it as the still does.
- **20b-10. The film's carry is not on the projection's faces.** `filmAdvect` builds
  its face velocities from the collocated flow, averaged, on a grid of another size
  than the solver's, and those carry a grid-scale divergence that compressed a thick
  film from 0.8 to 0.54..0.91 in half a second of one stir (lab, 128²). It takes back
  what the faces' net outflow would do to a film the same everywhere (the advective
  form): exact where the flow is free of divergence, not conservative to the last
  digit where it is not (`npm run lace` holds the volume to 0.1% over 20 s of
  stirring). Carried on the projection's own Rhie–Chow faces (a film grid that divides
  the solver's), it would be both. *A shortcut named for scope.*
- **20b-11. The bubble lens and the edge decodes do not see the film.** Only the
  plate's main decode draws the water's path less the film; a bubble over whole film
  (the lens's `decodeFluid` calls) and the edges show the colour at full strength, as
  `thickOptics` does. Pass the film to those decodes when the film is judged.
- **20b-12. The app's pours into the film are not in a check.** `lace` pours straight
  into the film (`lab.addFilm`); the Dropper's path (`onDeposit`: Alcohol and Soap as
  the solvent, clear oil joining the film, the front plate only) is judged by eye
  (judging §34). A lab case that drives `onDeposit` as the app does would hold it.

## 20c. The lace stays lace: a viscous film

The still's holes have no rims and the film between them stays wide. That is a viscous
film, whose own stretching viscosity 4ηh resists its retraction (a Trouton sheet), not
a thin film dragged over the glass. Two ways to get it, in order:

1. **On 18a (shipped behind Thin Gap, on in every look):** the film as a phase of high
   viscosity in the Hele-Shaw solver. The oil film against the glass with water beside it is modeled as two layers stacked across a pressure-driven Poiseuille gap (relative viscosity m = 50 for clear light mineral oil at 50 cSt, `OIL_NU = 5e-5` m²/s, with continuous velocity and shear stress at the interface; 4.15x drag at h=0.4, 15.95x drag at h=0.8). Stir impulse in `scripts/lace.mjs` scaled to [2.5, -1.5] / [-2.0, 2.0] so dye moves far enough under the ~16x drag to measure displacement (> 1 cell) without altering the 12% wave ratio bar. The
   hole is water invading a viscous liquid under capillary pressure, resisted by
   Darcy drag. This needs 18a's variable mobility and 18d's per-liquid viscosity, and
   costs nothing beyond them.
2. **Standalone:** the film's own in-plane velocity from the viscous-sheet equations,
   ∇·[ηh(∇v + ∇vᵀ + 2(∇·v)I)] = drag, driven by the film's edge tension 2σ. That is
   a vector elliptic solve like the pressure's. Try this only if the first way fails.

**Check:** a hole in a viscous film grows exponentially with no rim. The rim excess,
the film's thickness at the edge over its far thickness, stays under 1.2, where the
prototype's h³ film reaches about 2. A sheared hole stretches along the flow by at
least 2:1 before it meets another.

- **20c-1. Macro closeup cell field is a look-alike shortcut (opt-in since 33g: no look draws it by default; retained pending physical Rayleigh–Bénard / Marangoni simulation).** The procedural `cellField` in `src/gpu/wgsl/plate.ts` (evaluated at 6x zoom and timed on `cellClock`, verified by `npm run cellride`) draws concentric circular Voronoi cells and slides them with a flow map rather than physically simulating buoyancy-driven or Marangoni surface-tension-gradient convection cells and silicone phase separation (§25f). While 20c introduces physical viscous film drag in the Hele-Shaw solver (`thinGap.ts`), the sub-grid macro cellular structure remains a procedural camera-pass effect until physical density-inversion and micro-droplet solver passes are available.

- **20c-2. Settings tabs on the phone (shipped in #348's review).** Story in
  `docs/plan-shipped/20-lace-and-holes.md` §20c-2 (moved 2026-10-29, 19m).

- **20c-3** (S, a check in a cloud session): `npm run phone` with `PW_WEBGPU=1` in a cloud session fails "every tab of the phone's Settings rail takes a tap where it is drawn" on main e679e6d, with 23 of 24 tabs covered (all but Master), while a script that opens the rail alone at 390×844 finds none covered. Something an earlier step leaves open lies over the strip in the full run; find what `elementFromPoint` lands on instead and close it in the check's path, or fix the overlay if a phone would meet it too. Found in 14m's PR, which ran it on main to rule its own diff out.

## 20d. Hairline edges from the optical path (this is 18e)

No new work beyond 18e, but this look is its test: every edge of the lace is an
oil–water step of Δn ≈ 0.14 across up to the whole gap, the strongest the plate will
ever draw. **Check:** the line's width in the `look` render is one to two pixels at
1080p, and it sits on the edge.

## 20e. Flat discs on the front layer

- **What:** pouring large oil drops (up to about a sixth of the frame) on the front
  layer, where they sit over whatever the back layer holds. They are flat in the
  middle by the half gap, as `dropLens` already draws them. Their body tints by
  absorption through 18b, and the rim's ring comes from the aperture.
- **Missing:** the drop sizes' upper bound (`dropRadius` redraws past 5.2), and a
  look that pours drops on the front layer while the back layer carries the colour
  and the lace.
- **Check:** in the `look` render, a disc's middle is within 10% of the colour behind
  it, times the oil's tint, and its ring is darker than both sides.

## 20f. A look that puts it together, and its cost

A look with dense orange, red and indigo water on the back layer, the clear film
poured over it, alcohol on the sound's accents, and oil discs on the front. It is
named for what it is (Lace), not for the performer. It ships with its phone version,
like every look. It needs 18b, 20b and 20e; 20c and 18e make it match the still, and
it is judged on the Mac against the still.

**Order:** 18b (already planned first among the optics), then 20b with the lab check,
then 20e, then 20c on 18a's solver (shipped) once 18d gives each liquid its viscosity. 20a and 20d are the checks that
this look holds 18b and 18e to.
