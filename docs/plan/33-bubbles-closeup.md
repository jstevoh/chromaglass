# 33. Bubbles and the closeup, per liquid (asked 2026-10-19)

The owner, 2026-10-19: bubbles still look pixelated around themselves and sometimes
draw as a donut; bubbles should answer the liquid they are in; and the closeup looks
like a sheet of biological cells, where what is wanted is the liquid on the plate,
nearer and in relief. The research behind the bubble items is item 2 of
`/mnt/project-files/drops/research/bubbles-and-drops.md` (§1.4–1.5, the projected
bubble), in the project's shared files. Pictures of the report's halo and donut, before
and after 33a, are in `/mnt/project-files/drops/bubbles-2026-10-19/`.

Every item keeps the standing rule: nothing moves the frame as a whole from sound, and
each feature ships its phone version in the same PR (the plate shader is shared, so the
phone and the iPad draw what the desk draws; a new control goes on the phone too).

## ~~33a. No stepped ring round a bubble's hole~~ — **Shipped** (a hue gate on the line between two dyes, `boundaryDiff` in `src/gpu/wgsl/plate.ts`; `npm run holeline`). Story in `docs/plan-shipped.md` §33a (moved 2026-10-29, 19m-2).

## ~~33b. The soft glow still left round a hole~~ — **Shipped** (`airNear` flattens the dye's normal beside an air hole, `src/gpu/wgsl/plate.ts`; `npm run holeline`). Story in `docs/plan-shipped.md` §33b (moved 2026-10-29, 19m-2).

Left from it, so none of it is lost:
- **33b-2. A fixed reach and a wholesale flatten.** `airNear` looks 4.5 cells out and
  flattens the dye's whole normal there, so a real dye-to-dye step beside a bubble loses
  its relief inside that reach. Derive the reach from the Sobel and bicubic taps, and
  flatten only the air's own contribution (the slope of the density the air removed)
  once 33g's closeup changes how the relief is read.
  *Check:* `holeline` with two dyes meeting beside a hole: the step's relief at 4 cells
  from the rim at least 0.8 of its relief far from any hole.
- **33b-3. The smallest hole is only partly flattened.** At the hole of 1.8 cells the
  worst pixel in the ring is still 22 levels from the dye 10 cells out (the control's
  worst is the same 22, with the bubbles at 0), and Edge Relief still moves its first 3
  cells 4.6 levels (the control 5.5): `airNear`'s nine taps reach 4.5 cells out and
  find a hole that small only along a few directions, so the mask is patchy. Sample
  the air at the radius of the hole's own coverage (a blurred air mip), or take the
  taps from the Sobel's own footprint, and bring `holeline` to cover the 1.8-cell hole
  at the same bar (1 level) as the others; then find what draws the 22-level pixel.
- **33b-4. The lace and the boundary line at a hole** are not masked by `airNear`; 33c is
  the lace, and the boundary line is 33a's hue gate. Apply `airNear` there only if 33c's
  check finds a ring.
- For 33g (the closeup): the closeup is a different branch (`dropCam`); `airNear` applies
  to the shared normal so the closeup's dye beside a hole is flattened too. Check the
  closeup's meniscus on a bubble in `look` pictures before reshaping it.

## 33c. The lace reads the same lit difference (S)

`lacing()` (plate.ts) compares lit colours across taps 3 cells apart, the pattern that
drew 33a's ring, so a look with Lacing up likely rings every hole the same way
(inferred from the code, not rendered). Gate it the way 33a gated `boundaryDiff`.
*Check:* `holeline` runs its hole plate a second time with Lacing at 1: under 1 % of
the ring moved, and the lace on its own plate (`npm run lace`) unchanged.

## 33d. A bubble's edge at the screen's resolution (M)

Close up (zoom 3 to 5 in the lab) a bubble's outer edge is faceted: the band is drawn
from the air field, linear between texels, and its softness is clamped to 0.02–0.3 of
the curved band, so a small bubble's edge steps with the solver's cells, not the
screen's pixels. Reconstruct the edge's distance at sub-texel (bicubic of the air
field, or the bubble list's own circle where a bubble is still round) and antialias
it over one screen pixel at every zoom. Keep the air field's shape where a bubble is
deformed: a sheared bubble is not a circle.
*Check:* new `npm run bubbleedge` (lab): bubbles of 1.8 to 14 cells at zoom 1, 3 and 5,
the rim's radius found along 64 rays: RMS deviation from a circle under 0.5 screen
pixel, and the 10–90 % rise of the edge no wider than 1.5 pixels. Today's numbers
printed first.

## ~~33e. The bubble as the projector throws it, not a donut~~ — **Shipped** (the clear middle is the plate, `plate.ts`'s projected bubble; `npm run bubblelook`). Story in `docs/plan-shipped.md` §33e (moved 2026-10-29, 19m-2).

Left from it, so none of it is lost:
- **33e-2. The band's width from the meniscus, for small bubbles too.** The old text
  here said the band is "a share of R"; that is wrong past R = half the gap (the big
  bubble's band is already half the gap, and `airlens` holds it there), so only a
  bubble under a few cells is mostly dark, and the dark share does fall as the bubble
  grows (`bubblelook`, 80 → 34 %). What is not done is the width against the liquid's
  index (u* from the cell's index), which waits on 33f's per-liquid index.
- **Shortcuts, named.** (a) The lens is not drawn minifying (focal length about
  −1.5 R): the middle is flat, which is the lamp through a slab of air and right for
  a pancake, and a little wrong for a bubble that is nearly a sphere. (b) The meniscus
  is a circular arc of radius gap/2 (a contact angle of zero). (c) One index per cell
  (33f). (d) The middle takes at most a tenth of the wetting film's tint (`0.1·k1`),
  a choice, not a measurement.
- **A bubble in clear water is drawn at 70 % of the strength of one in dye** (found
  here, not changed): the compositing weight is `bubbleStrength·mix(0.7, 1, filmT)` and
  `filmT` is the dye's alpha at the rim, so with no dye the band can never be darker
  than 30 % of the plate, and with Bubbles at 0.8 and dye it is 28 %, at 1 and dye 10 %.
  Whether the 0.7 is a choice to keep, or a bug (a hole in clear water should be as dark
  at its rim as one in dye), is for 33f's per-liquid pass to settle with a picture.

## 33f. Bubbles that know their liquid (M)

The bubbles' motion reads one plate-wide viscosity and surface tension
(`liquidMu`, `liquidSigma` in `src/lib/bubbles.ts`; 18i), and their drawing one
index. The species field (`src/lib/liquidProps.ts`, 18d) already carries each cell's
viscosity, density and index. Read them under each bubble:
- *Speed and film:* Ca = μU/σ from the cell's μ; Bretherton's speed-up
  1.5/(1 + 2.26 Ca^(2/3)) (18i) with that Ca, so a bubble in glycerine lags the
  flow and one in alcohol runs ahead of it.
- *Shape:* the Saffman–Taylor fingering and a sheared bubble's stretch from the same Ca.
- *Merging:* the film's drainage time ∝ (μ/σ)·R (18i) per cell, so bubbles in syrup
  sit touching far longer than in water.
- *Optics:* 33e's band from the cell's index (oil about 1.47, water 1.33, alcohol
  1.36, glycerine 1.47); in ferrofluid the liquid is opaque, so a bubble is a bright
  window in black and its band the meniscus's thinning; in a milky liquid the
  middle is the brightest thing on the plate.
- A surface-tension table per liquid (water 72, oils about 30, alcohol 22, soapy
  water about 30 mN/m) added to the bottle's behaviour, defaulting to today's
  `liquidSigma` so every look keeps its motion.
Shortcuts to name: one σ per liquid (no surfactant moving along the rim, no Marangoni
flow), and the wetting film's thickness not drawn as colour.
*Check:* `npm run bubblephysics` extended: one bubble pushed through water, oil and
glycerine: the speed ratios follow Bretherton's law within 10 %, the drainage times
follow μ/σ within 20 %, and (with 33e) the band width oil against water follows u*
within 15 %; on the plate's own liquid, every number today's check prints unchanged.

## ~~33g. The closeup: the liquid nearer and in relief, not cells~~ — **Shipped** (Paint Cells and Macro Lacing default to 0; `npm run macroview`; 20c-1 is closed by it)

**Shipped.** Story in `docs/plan-shipped.md` §33g (moved 2026-10-29, 19m; the heading's numbers moved 2026-10-29, 19m-2).

- **33g-2. The closeup is still lit, not refracted.** The relief is the dye's own
  gradient read as a dome under a lowered lamp (shortcut: not a physical height field,
  the gap's thickness is not magnified), and the boundary line is thinned by 80 % at
  full closeup so it does not read as an outline. Not done from the first plan: the
  substrate seen through the surface's normal (refraction), a shallow depth of field
  and the dye's two layers parting in parallax. Each is a camera-pass term; take them
  one at a time with a `look` render, and keep `steadycam` green.
- ~~**33g-3. Three looks keep their cells by name.**~~ **Shipped** (the owner, 2026-10-29:
  "No I don't want cells"). `macro-bead`, `cell-bloom` and `lace-run` now set Paint Cells
  to 0; Macro Bead and Cell Bloom set Macro Lacing to 0 as well, and Lacing Run keeps its
  lacing (its subject, dendrites rather than cells). Descriptions, the landing page and
  the Guide say so, and `macroview` line 1 now audits every look. Open: Cell Bloom's name
  says cells; the owner to say whether to rename it (its id is in set lists and saved
  shows, so a rename keeps the id). Story in `docs/plan-shipped.md` §33g.
- ~~**33g-2a. The closeup's beads are the 3D.**~~ **Shipped** (the owner, 2026-10-30:
  "a couple really cool macro 3d looking views", on the card "Beads first"). The oil beads
  are the closeup's strongest depth cue (each a lens that turns the plate upside down inside
  a dark meniscus, `dropCam`), but at the plate's size they were grain. In the closeup
  (`macroMode`) the beads are now laid at 2.0 times the size scale (`beadPopulation` in
  `lib/beads.ts`; the plate's is as it was, to the bit), Macro Bead's Beads dial is 0.7 (was
  0.35), and Cell Bloom is Lens Pools (id kept: `cell-bloom`). Story in `docs/plan-shipped.md`
  §33g. Shortcuts, named: the factor is a taste choice (1.6 gave the mean radius 1.35 times,
  2.0 gives 1.44 to 1.49, 3.0 starts to leave the plate short of beads); beads already on the
  plate keep their size until they retire. Open: no new setting (the size follows
  `macroMode`, so a look cannot ask for smaller closeup beads); 33g-2 proper (refraction of
  the ground, depth of field, parallax) is still the next optics step, and `lampjudge.mjs`
  still quotes Cell Bloom's old description for its judge.
- **33g-2b. Round rims and clear windows on the closeup's beads: built, reverted, open.**
  Shipped as #611 (rim wobble at 5x on SwiftShader 1.2 px to 0.3-0.6 px, a pancake bead's
  clear window, `droplens` 32/32, green on GitHub's Macs) and reverted the same night
  because the owner's Mac (a real Apple GPU, `owner-mac`, which only a deploy reaches)
  failed `droplens` on it: the old line "dark round it from where the aperture says" read
  0.687 of the radius against 0.709 before and an allowed 0.72 +- 0.03, and the seven new
  roundness lines read 3.4 to 3.7 px (0.45 to 0.50 of a mask texel) at every size, 3 px
  more radius than SwiftShader, the same on two runs. So something the fit leans on
  (the clean read three texels in, the cone's slope from taps one texel either side,
  the edge coverage from `dpdx` of the surface uv) is not the same on Metal hardware as on
  the software rasteriser, and a pull request's run cannot see it. Next: put the fit back
  with the roundness lines printing what they read (the fit's accepted share, the mean
  `dropPx`, a row of raw mask taps) in a run that reaches `owner-mac` before it merges.
  The dimple half (`power`, the bend held to the rim) was not isolated and comes back
  with it. Shortcuts and numbers of the first build are in the pull request #611.
- **33g-4. A Metal run: `macroview` done, the thin boundary line open.** The CI `open`
  shard (Metal) ran `macroview`: relief 0.0386 to 0.051, smoothness 0.988 to 0.991, the
  old-defaults control draws cells at 0.1397 and 0.1693 (smoothness 0.69, 0.716), chroma
  distance 1.21 to 3.11, half-turned crop least 9.25, 1x chroma least 7.62. These match
  SwiftShader's. `edgeK` (the thinner boundary line at the closeup) has no measuring
  line, so it stands unmeasured; a `look` render at zoom 4 and 6 is still optional.

## ~~33i. The camera's dials do something~~ — **Shipped, this PR** (Settings → Camera: Refraction, Aperture, Bloom and Chromatic Aberration act at their own settings with Lens at 0, and are no longer greyed; the shader rebuilt on thin-prism refraction, a thin lens's blur circle, a power-law glow and Abbe dispersion, `src/gpu/wgsl/camera.ts`; the four default to 0 and saved looks and set lists are read as they looked (a look with Lens up has each optic rescaled by Lens, the aperture by Focus too and the bloom by Lens again, within 1.2 to 5.5 levels of the old picture over the lit pixels of a 1024 px frame), `PRESET_VERSION` 3; `npm run lens`: mean change of the frame at a full dial, Lens at 0, was 0.0 for all four on the old pass, now refraction 11.0, aperture 8.1, bloom 21.6, chromatic 4.6 levels on Metal; story in `docs/plan-shipped.md` §33i)

- **33i-1. Shortcuts to replace with the real thing.** (a) Dispersion runs at an Abbe
  number of about 8, the densest flints; real oils sit near 50 and would show nothing.
  Replace with per-wavelength refraction of the dye's real index (the plate's liquid
  table) and let the knob scale the exposure, not the physics. (b) The glow scatters what
  is over a 0.5 knee because the plate is stored in 8 bits and clips at 1; draw the plate
  in half floats and scatter true radiance. The glow also only adds light (gain 2.4 on what is
  over the knee) and takes none from the core, where a real point spread moves it out of the
  core; conserve it once the plate is in half floats. (c) Refraction displaces the picture by the
  surface slope; the light's path through the film's thickness is not traced, and the
  height the lens focuses on is the dye's column (`aux.z`), not the gap's real depth.
- **33i-2. Depth of field costs 64 taps a pixel and leaves hair at aperture 1.** Where a
  sharp dye ramp sits over a defocused ground the stochastic disc leaves a faint noise
  along the edge. Measure it on Metal at a full frame (`docs/judging.md` §105); if it
  costs frames, gather at half resolution for the wide discs. The gather weights also lack
  the disc-area share (about 64 over the radius squared of the physical strength); a naive
  area weight is noisier, so the wide discs are somewhat fainter than a real lens's.
- **33i-3. Lens up on a look still at the defaults is now only the sensor look.** The old
  defaults (aperture 0.5, bloom 0.4, refraction 0.6) came on with Lens; they no longer
  do. The shipped looks keep their cameras (checked, 33 looks); Lucky rolls the optics
  only when it takes the lens, so its output for a given seed moves once.
- **33i-4. Idea: the cyberpunk look's colour fringing.** It stored 0.35 that never drew
  (its Lens is 0); the dead value was removed. Give it a visible 0.2 if the owner wants
  the fringe on that look.
- **33i-6. A bubble's own lens is gone from the camera.** The old pass added `bub*0.045`
  to the refraction and shrank the blur by `1-bub*0.5` where a bubble sat; the new one reads
  no bubble mask (`aux.w`). A bubble is a diverging lens (a gas pocket in a liquid): bend by
  the bubble's own slope, and let Aperture treat it as the thing it is. Judge whether the
  closeup misses it first (`docs/judging.md` §105).
- **33i-7. Saved looks with Lens up are close, not identical.** Each optic is rescaled by
  Lens times a fitted ratio (`OPTIC_SCALE`, `src/lib/userPresets.ts`), the aperture's by Focus
  too (`apertureScale`) and the bloom's by Lens again (`bloomScale`: the old pass sent the glow
  through the sensor's roll-off before mixing by Lens, so it reached the frame about Lens
  squared). Over the lit pixels of a 1024 px frame the old defaults sit 2.2 to 3.2 levels from
  the old pass (4.0% to 8.9% of them moved by 8 or more), an every-optic-at-.8 look 3.6 to 5.5
  (10.7% to 14.0%), at .25 1.2 to 1.8 (0.7% to 3.8%), the worst of each at Lens .6. The rest is
  the kernels: the old 12-tap blur and 8-direction glow against the new 64 taps and 60 samples.
  The old fringe was under half a level, so chromatic maps to about 0.03, and no scale of it can
  be told from another. And the frame: the old blur circle was a count of pixels and the new one
  a share of the frame, so the aperture is fitted at 1024 px, about the frame the looks were seen
  at; on a smaller frame (a phone) a migrated look is softer than it was, on a larger one
  sharper. A saved look does not record its frame, so the fit cannot follow it. `npm run lens`
  section 6 holds the bars (4.3, 7.4 and 2.4 levels; 12%, 19% and 5% of the lit pixels) and two
  controls: the 384 px fit must miss them (11 of 12 looks at Lens 1), and the fitted bloom and
  refraction at half and one and a half times must sit further from the old picture on most
  looks (bloom 18 and 18 of 18, refraction 15 and 18).
- **33i-8. A dial swept through 0 rebuilds the camera pass.** The visualizer builds a new
  `WebGPUCamera` when `cameraWanted` turns true and disposes it when it turns false
  (`LiquidVisualizer.tsx`), so each crossing compiles the pass's pipelines again. Before 33i only
  Lens did that; now any of the five does, and a MIDI knob turned down to 0 and up, or a sound
  cord dipping a dial to 0 on each beat once 33i-5 adds keys, rebuilds it each time. Measure
  the hitch on the Mac (a knob swept through 0 ten times, `npm run stutter`'s two-step frames),
  and if it shows, keep the pass for a few seconds after it stops being wanted.
- **33i-5. `sceneMap.ts` has no keys for the camera's dials**, so a scene cannot ride
  them; add them if a scene should (the frame must not move with sound).
- **33i-9. Evolve wanders the camera.** Evolve's glass theme (`src/lib/drift.ts`) names
  Refraction, Chromatic Aberration, Aperture and Focus. It never turns a dial on from 0, so a look
  with the optics at 0 is untouched, but on a look with one up and Lens at 0 it now wanders an
  optic that draws, where before 33i the same dial drew nothing. And a dial's window reaches a
  fifth of its range below where the look set it, floored at the dial's minimum, so one set
  under 0.2 can be walked to exactly 0 by a calm passage at full Evolve Speed: with Lens at 0
  and nothing else up the pass is torn down and built again on the way back (33i-8). Ask the
  owner (`docs/judging.md` §105) whether the camera belongs in the glass theme; if it stays, floor
  an optic's window above 0 as the look's own zero rule does, and `npm run lens` already prints
  which optics Evolve may wander.
- **33i-10. A set item's controls and a sequence stage's settings skip the migration.**
  `SetItem.controls` (`src/lib/setList.ts`) and `ShowStage.settings` (`src/lib/sequencer.ts`)
  are partial settings laid over a look as it plays, and they are not saved looks, so
  `upgradeSaved` never reads them. One made before 33i holding an optic beside Lens 0 now draws
  that optic: an item's controls are the strip's rides when it was captured
  (`src/app/useSetActions.ts`), so an optic pinned to the strip; a stage's settings are set a key
  at a time in the sequencer, where Aperture and Bloom could glide before this PR. No shipped set
  list or sequence sets one (the starter set has no controls, and the five built-in sequences'
  stages name none of the optics or Lens); the owner's own may. Read such a file's version and
  zero the four where the item or stage leaves Lens at 0, as a look is read, with a `setlist`
  line for it.
