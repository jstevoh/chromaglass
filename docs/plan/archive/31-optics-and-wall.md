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
