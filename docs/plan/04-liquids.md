# 4. Liquids that behave differently

**Shipped**, with milk's opacity shipped in 18j (#353). How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**Milk's opacity shipped (#353, 18j).** Optical scattering (Kubelka–Munk diffuse backscattering on black ground, two-flux forward extinction and forward halo on lamp ground) packed into `vel.w` from the advected `species.b` field. Colour sits on the opaque white body of milk as solid vibrant red (reference §4).

# 4a. What is in each preset's dish

**Shipped**: what each preset puts in its dish. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**4a-clock. Clock Glass and Ferro Paint after their references** (**shipped**, #280).
The owner, 2026-10-04: "the clock glass preset is really underwhelming as is the ferro
presets. They don't look anything like the inspirations." Judged against the Mac gallery
of that morning (`/mnt/project-files/lamp-ground/gallery/`, 12 s and 30 s):

- Clock Glass was one lavender-magenta disc. A clock-glass dish (the Joshua Light Show,
  the Fillmore) is coloured oil and water that will not mix: cells of red, amber and
  blue oil with dark rims in a purple water. The look laid three water dyes in rings on
  top of each other, with radii in the wrong units (below), so they blended at once.
  It now lays a purple water round twelve bodies of oil, each with one of red, amber and
  cobalt in it, with Oil Bodies and Oil Tension on (`src/lib/oilLay.ts`). Laying it found
  a fault in Oil Bodies itself: the oil's share of the dye started empty when a plate
  first had bodies, on the reasoning that the colour inside a body would be handed to it
  in a few steps. It was not: the bodies' colour ran out into halos in the water. The
  share now starts from the plate as it is (`fluid.ts`, bodiesFresh). `npm run
  clockglass` (lab, 192², 300 steps): the dish's colours spread 0.248 rad against the old
  lay's 0.101, in 4 separate regions off the water, and the oil holds 97% of the colour
  laid in it (17% with the share starting empty, 3 regions). `npm run bodies` 17/17.
- Ferro Paint opened as one green with black holes, where Colored I and II hold amber,
  teal and coral in regions. Its sixteen patches were laid with a radius of `S × 0.15`
  in `splatBlob`'s 128-grid units, which it scales by GRID_SCALE again: 0.225 of the
  plate, nearly the patches' spacing, so all sixteen lay over each other. Now 0.09.
- Open from this: **4a-units**. Roy, 1963 lays its shapes the same way (`S × fr` in
  128-grid units, 1.5 times the size meant); its panel may want them halved, by eye.
  **4a-clock-fade**: on a fade (the set list, the desk's Go) the seed is laid in shares
  over the fade (addSeedShare) while every body's oil lands at once, so on a long fade
  the bodies move before their colour arrives and some of it lands in the water: the
  halo this fixed for a hard lay. Lay the oil in the same shares, and give `npm run
  clockglass` a case that lays through the handover. Also unmeasured: the look's own
  doses (`['oil', 'water', 'oil', 'syrup']`, about seven small clear bodies at the
  lay) and the app's finer GPU grid (the check lays at 192², the app runs 384² and up).
  And the automation's drops still land any of a look's dyes anywhere, so over a minute
  the regions blur: where each dye lands belongs to the "more going on in every look"
  work (several areas of interest across the plate), not to these two looks.
