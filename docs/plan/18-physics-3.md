# 18. The physics under the look: where the plate imitates a result instead of simulating it (continued)

Part 3 of 3 of §18; it begins at 18l-7. The section starts in `18-physics.md`.

- **18l-7. Poster 1969 keeps Transmission 0.5.** At 1 the pigment's grain (#267) varies
  the depth of its strong inks on the lamp enough to fleck the edges (`npm run grainedge`
  4.1% of edge pixels, the line asks under 2%; 0.6% at 0.5). Decide with the grain's
  owner whether a deep ink's grain should swing its colour less, then drop the pin.
  (`npm run royopen`'s black control is now scaled to an opaque ink, since a dye's
  strongest band passes 4% a unit: at that strength the control printed dark grey.)
- **18l-1. Real dye spectra (the shortcut kept).** Still three bands: a dye's colour is
  three transmissions, and the 4%/96% limits stand in for the tails of a real absorption
  band. Spectral Optics' six bands cannot reproduce the palette's saturated colours (its
  bands are too wide: hot pink comes out 0.66/0.32/0.41), so it is no replacement as
  it stands. The real thing is each dye's absorption spectrum (smooth bands, fitted so
  the dye at one unit is its palette colour) mixed wavelength by wavelength and summed
  through the CIE matching functions, which turns yellow over blue green as paint does;
  it needs either more dye channels in the solver or a smooth three-coefficient basis
  for the absorbance that stays closed under mixing.
- **18l-2. The packed dye caps absorbance at 8.** `packDye` stores each channel
  √(d/8) in 8 bits and clamps at 8, so a dense pool of a dye that blocks a band
  (absorbance 3.2 per unit now, 6.2 before) saturates that channel's store at a density
  of 2.5 and the decode's per-unit colour lets the band back in. Belongs with 14i's
  float dye for the plate (and the pixelation work, #267).
- **18l-3. The thin floor.** The decode still clamps the depth it draws at 0.35 to 4,
  so the thinnest wash is not paler than a third of a unit and the deepest core not
  deeper than four; inside that range the colour is the stored absorbance exactly. A
  thinner floor reads as a milky halo on the black ground; on the lamp ground (18b) the
  depth is not clamped.

## 18m. A drop slumps under its own weight (replaces a drop that sits or blurs)
**Shipped** (#364): a pool of dye on a level plate runs out along the lower glass as a
viscous gravity current (`wgsl/slump.ts`, its own stage in the dye's step, apart from
18h's blur), measured against Huppert's law by `npm run slump`. How it was found, built and
measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number. Open:

- ~~**18m-1. The slump's cap (a speed shortcut).**~~ **Partly shipped** (#371): a per-cell regime switch min(viscous rate, inertial rate) with the Huppert–Simpson front Froude number in `slumpRate`, in planned substeps (`npm run slump` 13/13). Story in `docs/plan-shipped.md` §18m-1 (moved 2026-10-29, 19m-2); what it keeps is 18m-1a.
- **18m-1a. Implicit backward-Euler slump step and grid-independent inertial flux.**
  #371's `min(viscous, inertial)` is a regime switch inside the explicit pass, not an
  implicit step, and keeps two shortcuts: (1) the pass is still explicit forward Euler in
  at most `SLUMP_SUBSTEPS = 20` substeps planned against `SLUMP_FACE = 0.24` at `DYE_CAP`,
  with the per-face `min(a, SLUMP_FACE)` (`0.24`) stability guard in `slump`, rather than
  an unconditional backward-Euler solve `(I − Δt ∇·K∇)A = A^n` with lagged K on the thin
  gap's multigrid with an identity term — `SLUMP_SUBSTEPS = 20` covers up to 1024² at
  `solutalBuoyancy = 1` at 60 Hz (`mostInert ≈ 4.57`, 20 substeps of `≤ 0.23`), so the
  `min(a, SLUMP_FACE)` guard binds only when `ceil(most / SLUMP_FACE) > 20` (a slow frame
  with `dt > 1/60 s` on a 1024² heavy-dye water plate, or a locally deeper squeezed gap
  where `η(1 − η/gap)` exceeds its rest-gap value); and (2) writing the inertial front
  speed `u_f = Fr √(g′η(1 − η/b))` into the diffusive rate as `K_inert Δt/Δx² = u_f Δt/Δx`
  assumes the front drops across one cell Δx (`K_inert = u_f Δx`), rather than
  propagating the front at `u_f` independent of Δx. Replace the explicit substeps and the
  `min(a, SLUMP_FACE)` guard with the lagged-K backward-Euler multigrid solve and a
  Δx-independent inertial front flux.
- **18m-2. Coloured water in oil is a puddle, not a current.** Dye Weight at 1 says the
  dye is water in an oil (15% heavier), and two immiscible liquids do not mix into a
  gravity current: surface tension holds the pool at its puddle height and it stops
  spreading. Today it slumps on as if miscible (×1.27 further at 20 s). With 18d's
  liquids (an interfacial tension per pair), stop the current at the capillary height.
- **18m-3. Weight from what the liquid is.** Δρ is the dye's strength times Dye
  Weight's contrast. The species carries each poured liquid's real density (18d-4), and
  the ferrofluid's share of a cell is read as water. Take Δρ from the species, and the
  ferrofluid's share out of the current's room as the oil's is.
- **18m-4. The lobes.** A real pool's front is lobed; this one is round. On a still
  plate a viscous current's front is stable (Huppert's own pools were round), so the
  lobes are the plate's: the drop landing off true, the glass not flat, the lamp's heat
  (18f) and the flow streaking it (18h). Look again once 18f and 18h are in; build
  nothing for them here.
- ~~**18m-5. The grid filter makes dye at a drop's rim.**~~ **Shipped**: `dampGrid` takes its clamp's excess back across the 7×7 neighbourhood around the stencil (`dampGridCurv`, `dampGridLimit`, `dampGrid`); story and numbers in [`docs/plan-shipped.md`](docs/plan-shipped.md).
- **18m-5a. Run `npm run slump` with the grid filter on.** Now that `dampGrid` holds the glycerine drop's dye (`+0.000%` at 2 s and 20 s, against `+0.93%` and `+3.20%` before; `+0.42 ppm/s` on `npm run grating` §4 against `+1.47 ppm/s` on `main`) and does not move the front (`3.94 mm` at 2 s and `4.50 mm` at 20 s, against `4.13 mm` and `4.66 mm` before), turn the grid filter on in `scripts/slump.mjs` and fold the glycerine drop conservation check from the 18m-5 PR into `npm run slump`.

## Kept, named as dials or looks

These are not physics and do not pretend to be: vorticity confinement (declared "not
physics a thin film has", off by default), the hand stir (Turbulence and the music's
swirl: a hand or a stick through the layer, which imposes its motion whatever the
liquid, so on a thin gap it is still read as this liquid's speed at the rest gap, PLAN
18a-2), Polarity's hold between colours (until 0-fingering makes it a capillary jump),
Vibration (until the ringing glass, 18a-2's open item), the drift and room stir, the camera and
closeup looks' lens effects (depth of field, bloom, chromatic aberration), film stock,
the corner-pin grade, the lamp's hot spot and warmth, Roy's Ben-Day dots, and the
kaleidoscope. The noise stirring stays as a stir dial once 18a gives the plate its own
motion. The numerical patches of the collocated grid (`dampGrid`, the Rhie–Chow faces,
`mixRelax`) are numerics, not faked physics, and are worth reconsidering with 18a.

## Already physical

The multigrid projection. The gap field, with the press as a −ḣ/h source. The oil's
Cahn–Hilliard phase with a curvature capillary force, moved in flux form and conserved
exactly. Oil Bodies' partition of the colour. Marangoni flow as conservative surface
transport. Buoyancy in `mixForce` only when the plate stands up. The dye stored as
per-channel absorbance. Acid and base as signed equivalents. BZ and Liesegang. The
ferrofluid's pull as ∇|B|² with Langevin saturation, and the Ohta–Kawasaki labyrinth.
The drops' and bubbles' aperture optics, shapes set by the gap, Paterson relaxation and
Laplace-arc walls. The Airy thin-film table.
