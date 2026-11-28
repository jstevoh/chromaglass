# Archive: 31. Optics and the wall: what Boris FX Continuum showed (2026-10-11)

The closed items of [`docs/plan/31-optics-and-wall.md`](../31-optics-and-wall.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 31p. Polarised light: the owner's photograph of dishes between polarisers (2026-11-14)

~~**31p-1** Polarisers, Analyser, Quarter Wave, Birefringence~~ (shipped; story in
`docs/plan-shipped.md` §31p-1; `npm run polar`).

## 31s. The surface is drawn from the dye, not traced from the liquid (2026-11-22)

- **31s-1. The liquid's surface height as a solver field.** **Shipped.** A height field h (the oil layer's
  thickness over the water, and the water's own free surface) advected by the flow and levelled
  by the thin-film (lubrication) equation: dh/dt + div(h u) = -div( h^3/(3 mu) grad(p) ), with
  p = -sigma lap(h) + rho g h. Surface tension pulls a drop's edge into a meniscus whose width is
  the capillary length (about 2 mm for oil on water, sqrt(sigma/(rho g))); gravity levels a
  wide pool. Interfacial tension between oil and water sets the contact shape where the phases
  meet (the phase field already knows where). *Measure (lab):* a still lens of oil keeps the
  meniscus profile set by the capillary length (within 10%); a sine ripple of wavenumber k on a
  layer h0 decays on tau = 3 mu / (h0^3 (sigma k^4 + rho g k^2)) (within 15%); mass of h is
  kept to 0.1% over 600 steps (`PW_WEBGPU=1 npm run surfaceheight`).
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

## 31p. Polarised light: the owner's photograph of dishes between polarisers (2026-11-14)

~~**31p-3** Dish Stress: the moulded dish's own stress in series with the liquid~~ (shipped;
story in `docs/plan-shipped.md` §31p-3; `npm run polar`).

## 31s. The surface is drawn from the dye, not traced from the liquid (2026-11-22)

- **31s-14. ~~Every film refused: the flower gate's control and its path measure went blind with 38u-10~~** shipped 2026-11-28. Found filming 51c-2 on main c9cfd74: `npm run flower` read the path (.z) at exactly 0 on the owner's Mac and the point-read control no worse than the build, so `flowergate` refused every film. Two faults, both from 38u-10 (#1037). The projector's derive pass reads cells through `cellDye` (wgsl/dyeIndex.ts), which kept its own copy of the cell's footprint, so the control's one cut in `cellDensity` reached only the camera's reader (control slope 0.058, the build's, against 0.3 needed); and the dye's index is real at Dye Index Boost 1, a path slope near 1e-6 that a half float flushes to 0 on the Mac and keeps as dust in the cloud lab (band sums 0.0 to 0.1). Now one `cellSide` (plateSlope.ts) serves both readers, the path is measured at x3370 (holeline's INDEX_LIT, the old stand-in), and the "sees the rim" line needs band sums over 1, not over 0. `npm run flower` 2 FAIL (cloud) -> 9/9: control slope 0.348 ring, 0.339 bubble; build path comb 0.058 ring, 0.050 disc and bubble.
- ~~**31s-1a. The height field is paid for before anything draws it**~~ **Shipped** with 31s-2
  (2026-11-28): the whole-grid pack into the display's binding 27 is gone (that binding is the
  traced light now), and the derive pass reads the height for the traced path's oil every frame
  (`SURFACE_PATH_WGSL`), so the step has its reader.
- ~~**31s-2. Light traced through the surface, gathered on the wall.**~~ **Shipped** (2026-11-28,
  `npm run caustics` 10/10; with 48b and 47j's projected half). The derive pass's whole-column path
  (`.w`), its oil now from 31s-1's height (dn h, bilinear) and not the view's share, is turned into
  a mesh of landed rays, x + dz grad(OPL), one vertex a cell; each triangle carries its plate area
  over its wall area, gathered ones splatted with a tent so a focus or a fold keeps its light;
  spread by the lamp's disc (half angle 0.02 rad, so a caustic past dz is no sharper than
  dz * 0.02); read by the display as `wallLight0/1` in place of the first-order `defocusShadow`,
  which stays as the fallback while the pipelines build and for a projector source with its own
  Focus. Focus's middle traces nothing (no look changes there); the dial's throw keeps the old
  law's strength where the map does not fold (`PROJECTOR_DEFOCUS_METRES` 0.183). Measured: a flat
  path even to 0.000%; light kept to 0.003%; a plano-convex lens of Rc 6.85 mm, dn 0.137 peaks at
  47.5 mm against Rc/dn 50 mm, its light all kept at focus; a ridge's folds at 0.38 s against
  0.40 s; three domes of 1, 2 and 4 cells light three peaks; a ripple follows 1/|1 - c sin kx|
  to 5.3% and folds between c 0.9 and 2, its fold pair 9 texels apart as the law drawn through
  the lamp's disc has it; the back plate traces in its own half; the derive pass writes a 0.4 mm
  oil cap as 0.0274 rest gaps (dn h / gap exactly); and the display drawn with the trace differs
  from the first-order fallback on 9.1% of a dyed plate. The old law fails 5 of the 9 as a
  control. The first films on the owner's Mac (Oil & Water at Focus 0.6 and 0.8) showed the oil
  bodies' meniscus, 31s-1's 1.5 mm of oil over a cell or two, bending its rays about 0.5 rad and
  the trace throwing them 15 to 44 mm across the plate as streaks, the drops left black and
  smudged: a ray bent past the head lens's aperture (`PROJECTOR_NA` 0.25, plateTransmit's
  DROP_NA) now carries no light, each ray the share of the lamp's cone inside it, a triangle the
  least of its corners' (a pancake of oil keeps 0.9800 of the plate's light against 0.9797
  predicted, and nothing lands past where a passing ray can, line 10). The ripple's law is now
  drawn as the trace draws each part (drawn triangles at texel centres, splats as tents): 4.8% in
  the cloud, where the first target read 5.3% and the Mac 6.4%. Small drops still went black at 0.6 in the second films: 31s-1
  seeds its 1.5 mm of oil over the share's edge of a cell or two, steeper than a real meniscus,
  which between two glasses is about half the gap round, so the path now reads the height through
  a tent half a gap each side (`MENISCUS_METRES`); in the lab at a 512 grid small drops then light
  as lenses at 0.6 and, far past their own short focus at 0.8, draw a dark disc ringed by their
  spread light, as a strong bead does on a projector. `npm run nolight`'s turnover (lines 7 and 13) is now asked either side of the middle
  (Focus 0.56 against 0.44), where the traced map is linear: at 0.8 against 0.2 the oil turned
  over at 75% (3761 of 5010), the trace moving light rather than flipping it pixel for pixel; at
  0.56/0.44 4057 of 4074. A glycerine pour's sharp edge throws its rays wider than its ramp even
  there, so its pixels at the edge are dark both sides (714 of 1464 at 0.8 to 1.1 R), as a real
  shadowgraph of a sharp interface draws: line 13 asks the turnover inside 0.8 R (975 of 1018)
  and that no pixel anywhere is brighter both sides (0). Not yet replaced (each an item below):
  the in-focus pupil loss (31s-2b) and the dense slope stencil (31s-3).
- ~~**31s-2f. `npm run caustics` line 7 (ripple) on Metal**~~ shipped 2026-11-28. The ripple read
  6.1% against its 6% bar on the owner's Mac and 4.8% in the cloud because the trace's light hung
  on how each GPU rounds: the sampler that read the path (free to filter a half-float texture at
  16 bits), the sub-texel grid a rasteriser puts corners on before it interpolates a splat's tent
  (a sixteenth of a texel in SwiftShader: a CPU copy of the trace matched the cloud's light to
  0.1% only with corners rounded to it), and which of two neighbouring cells covers a texel
  centre that grid moves across. The trace now reads the path with four textureLoads mixed in
  f32, weighs each tent from the texel's own centre, and draws each triangle as its box with the
  centres it holds chosen exactly in the fragment stage (shared edges tested in one order, ties
  to the left). Line 7: Mac 6.1% to 5.0%, cloud 4.8% to 4.7%; caustics 10/10 on both; the bar
  stays 6%. Still owed from it: the one black frame at Focus 0.8 (3.17 s into branch2-f08), with
  31s-2d.
