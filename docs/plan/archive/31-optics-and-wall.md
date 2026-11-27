# Archive: 31. Optics and the wall: what Boris FX Continuum showed (2026-10-11)

The closed items of [`docs/plan/31-optics-and-wall.md`](../31-optics-and-wall.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 31p. Polarised light: the owner's photograph of dishes between polarisers (2026-11-14)

~~**31p-1** Polarisers, Analyser, Quarter Wave, Birefringence~~ (shipped; story in
`docs/plan-shipped.md` §31p-1; `npm run polar`).

## 31s. The surface is drawn from the dye, not traced from the liquid (2026-11-22)

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
