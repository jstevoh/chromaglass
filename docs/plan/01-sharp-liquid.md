# 1. Sharp liquid, and pigment in it

**Shipped**: the measured verdict retired sharpening (the pass itself still runs behind the Sharpness slider and MIDI CC15, default 0: 1k; corrected 2026-11-21, 38v), granulation stands. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

## 1a. The grain at the dye's edge made the plate look digital (shipped)
- **1b. Agate's Liesegang rings are dots on a 128² lattice** (lane C, `liesStep` in
  wgsl/fluid.ts, `LIES_GRID`). The precipitate nucleates once per cell of its own grid, so
  at a laptop's size Agate shows a regular grid of dots where real Liesegang bands are
  continuous rings. Measure: the `lock` of `npm run pixels` on Agate at the lattice's pitch
  rather than the solver's.
  38v (2026-11-21): the rings step by steps, not seconds: `fluid.ts:1596-1621` and
  `reactions.ts:87-111` run on `LIES_GRID` 128 with no Δx, while BZ already uses
  `magnetSeconds`. Liesegang bands grow with D of 1–2e-9 m²/s; take Δx =
  `PLATE_METRES`/`LIES_GRID` and the step's seconds. Check: the ring radii within 2% at 30, 60
  and 120 Hz, and at the dial's 0.25 against 1. (From RS-4.)
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
- **1j. The gooey blur reads the dye bilinear, so the dye's own edge has a corner at every
  texel** (found 2026-10-31 building 1i). `blurAlpha` takes plain bilinear taps a fraction of
  a cell apart, and the gooey edge's contrast (1.2 + 4 × Gooey) steepens the result two to
  three times, so the opacity's slope jumps at every texel for every look with Gooey on (1i's
  probe: the film's second difference 3 to 13 times its median on texel centres). Thin Film's rings
  showed it sixteen-fold and 1i reads them smooth where the blur is under half a cell
  between taps; past that (blurAlpha's wide form, Gooey × Post Blur of about 0.25 and up at
  the lab's grid-to-picture ratio, no shipped look yet: the highest is 0.21) the rings keep
  their corners (`npm run filmrings` prints 4.0 at zoom 1.3 and 12 at zoom 3 for Gooey 0.9 ×
  Post Blur 0.6). The edge itself, the relief and the boundary line read the same opacity. Fix: the same B-spline in `blurAlpha`'s narrow form
  (under a cell it is the blur anyway), measured with 1i's probe on `fluid0.a` and a `look`
  crop of a dye edge at zoom 3; the cost is on every dye pixel, so time it on the Mac first.
- **1k. Sharpening is still a live dial** (S; Low). `dye.ts:143-169` runs the sharpen pass
  with `SHARP_FLOOR` 0.08, `fluid.ts:1624-1629` calls it, `LookSections.tsx:50-57` shows the
  Sharpness slider and `midi.ts:1130` maps CC15, though the verdict in `docs/plan-shipped.md`
  (§1) retired it; Evolve never raises it. Remove the pass, the slider and the CC with a
  settings migration that drops the key. Check: `npm run panel` and `npm run desk` pass and a
  saved look with Sharpness loads. (38v, from RS-9.)
- **1l. The thin gap's dye carry rounded every edge it moved** (asked 2026-11-22: Galaxy
  looked like a blurry lens, not a sharp Hubble picture of a galaxy). `bodyAdvect`'s MUSCL
  flux limited its slope with minmod, which falls back to first-order upwind at every edge
  of colour; its numerical diffusion (about 1e-7 m²/s at a look's speeds) is some three
  hundred times dye's own in water, so the carry, not the liquid, made every edge a ramp.
  **Shipped** with the monotonized central limiter (still TVD, second order in smooth
  colour). `npm run dyeedge`: part-full cells per full cell 0.713 → 0.541 (an exact carry
  is about 0.29), colour kept to 0.000%, no overshoot.
- **1m. mixAdvect and the phase field still limit with minmod** (found building 1l).
  `mixAdvect` (the oil's fraction, `carry.ts`) and the phase step (`phase.ts`) carry an
  interface profile that their relaxation holds to a set width, so MC may fight it rather
  than sharpen anything real. Try MC on each in the lab and keep it only if the profile's
  width holds and `oilmass`-style totals stay put; unbuilt.
