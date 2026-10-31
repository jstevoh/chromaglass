# 1. Sharp liquid, and pigment in it

**Shipped**: sharpening retired, granulation stands. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

## 1a. The grain at the dye's edge made the plate look digital (shipped)

**Shipped.** Story in `docs/plan-shipped.md` §1a (moved 2026-10-29, 19m).

- **1b. Agate's Liesegang rings are dots on a 128² lattice** (lane C, `liesStep` in
  wgsl/fluid.ts, `LIES_GRID`). The precipitate nucleates once per cell of its own grid, so
  at a laptop's size Agate shows a regular grid of dots where real Liesegang bands are
  continuous rings. Measure: the `lock` of `npm run pixels` on Agate at the lattice's pitch
  rather than the solver's.
- **1c. A Retina laptop on the website opens at one device pixel per CSS pixel**
  (`platform.ts`: the hosted ladder starts on `{512, 1}`, tops out at 1.5x). The plate is
  drawn at a quarter of the panel's pixels and upscaled until the governor climbs, and
  never above 1.5x. Whether it can open higher without missing frames is for
  `npm run pixels -- --rung 0` and the frame time on the owner's laptop.
- **1d. On CI's Mac every look settles on 256²**: the governed `pixels` run went
  512 → 384 → 256 in every look in its first twenty seconds. If the owner's laptop does
  the same, the plate is drawn from a quarter of the cells most of the time; a look's
  grid should be measured on the owner's machine (judging §40) before the ladder is changed.
- **1e. The lab draws without the grain field unless asked** (`lab.render`'s `grain`
  option, scripts/lab-entry.ts). Without it the plate reads a blank texture and every
  look's grain is one value, about 0.75, everywhere: each lab check of a look with grain
  measures a plate a quarter thinner in optical depth than the app's. `benday` had its
  washes tuned on that (re-laid in 1a). Draw with the grain by default, and re-read the
  checks that move.
- **1f. Roy's print flips ink on the grain** (PLAN 21). The Ben-Day print decides ink or
  paper per pixel from the finished picture's coverage, so the grain under it flips
  pixels at every tint's threshold: 8.2% of Roy's edge pixels on the Mac against 0.02%
  for the plate under the print. A print should read the dye's coverage before the grain
  (or Roy ship without one); the owner's eye decides which (judging §40).
- **1g. On the lamp the grain mottles a thin edge** (18b's looks: Poster 1969, Fillmore,
  Microscopic Chaos and the rest on the lamp). This fix does not change them (the same
  numbers before and after it): the grain's soft blotches, about ten pixels across,
  move a thin edge's pixels 9–10.6 levels on average (`npm run grainedge` prints it), with
  no flecks. Watercolour-like, not dithered; whether it is too strong is the owner's call.
- **1h. A screen-space anti-aliasing pass (FXAA and its kind): not for the plate; the
  projector's warp is the one place the picture itself aliases** (asked 2026-10-05, from
  an After Effects FXAA plugin). FXAA finds pixels whose brightness jumps against their
  neighbours and blurs along the edge it guesses, which repairs one-pixel stair steps on
  rasterised triangles. The plate has none to repair: it is one full-screen shader whose
  edges are already drawn as coverage over a pixel and a half (`fwidth` in wgsl/plate.ts:
  the rims, the drops, the ferrofluid's line), and the dye is read through a Catmull-Rom
  filter (`textureBicubic`), not nearest texels. What reads as blocky comes from the
  **simulation grid**, not the final image: at 256² on a 1440-wide panel one cell is
  about 5.6 pixels, so a step along a dye edge is five pixels tall, far wider than FXAA's
  one-pixel blend, and the fixes for that are the grid's own (1b, 1c, 1d). Run over the
  finished frame, FXAA would also take things that are meant to be there: the pigment's
  grain (1a), Roy's Ben-Day dots (a regular high-contrast pattern is exactly what it
  smears), and the razor edge of a thick ferrofluid domain (judging §41). A temporal
  pass (TAA) is worse on a liquid: everything moves every frame, so its history ghosts.
  Where the **final image** does alias is the projector's pass (`src/gpu/wgsl/output.ts`):
  each wall pixel takes one bilinear tap of the plate (`textureSampleLevel(..., 0.0)`, no
  mip levels), so a surface whose corner pins shrink the picture (a keystoned far side,
  a small mapped shape) skips texels and the grain, the dots and thin fingers shimmer
  there as the liquid moves; and a surface's `feather` is in its own space, so on a
  shrunk side a 0.01 feather can fall under a pixel and its outline stair-steps. The real
  fix is to filter by the pixel's footprint: take as many taps as the warp shrinks the
  picture (its derivatives give the count), or build mip levels of the plate's picture
  when a surface needs them, and give the feather a floor of a wall pixel and a half.
  Measure with `npm run map` (the lab, `PW_WEBGPU=1`): a pinned surface at a half and a
  quarter of its size, a fixed picture panned a fraction of a texel a frame, and how
  much each wall pixel flickers beyond the pan itself (shimmer) before and after, and the outline's width in wall pixels. Unbuilt; nothing to judge yet.
- **1i. Thin Film's fringes are faceted at the grid's cells** (found 2026-10-30 from 38m's
  pictures; the owner: "the edges are super pixelated"). The fringe phase is the dye amount
  times 16 (`plate.ts`, the `U.thinFilm` block): six or more fringes across an edge only a few
  cells wide, read from `fluid0.a` through the texture's bilinear filter. Bilinear is
  continuous but its slope jumps at every cell edge, and at sixteen periods per unit of dye
  those jumps show as polygon corners in every ring (measured on the lab's 192-cell plate at
  zoom 1.3: rings stepped every 4 px, one cell). Both Film Physics settings show it; it is the
  sampling, not the colour. Fix: read the film's amount through a smooth reconstruction
  (bicubic B-spline, the four-tap form 33's bubble edge also wants) only where `thin > 0`, so
  the cost falls on the fringes. *Measure:* a `look` crop of a dye edge with Thin Film 1 at
  zoom 1.3 and 3, before and after, and the rings' curvature jump at cell edges. Waits for
  the lighting threads to leave `plate.ts`.
