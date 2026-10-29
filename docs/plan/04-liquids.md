# 4. Liquids that behave differently

**Shipped**, with milk's opacity shipped in 18j (#353). How it was built and measured is in [`docs/plan-shipped/04-liquids.md`](../plan-shipped/04-liquids.md), under the same number.

**Milk's opacity shipped (#353, 18j).** Optical scattering (Kubelka–Munk diffuse backscattering on black ground, two-flux forward extinction and forward halo on lamp ground) packed into `vel.w` from the advected `species.b` field. Colour sits on the opaque white body of milk as solid vibrant red (reference §4).

# 4a. What is in each preset's dish

**Shipped**: what each preset puts in its dish. How it was built and measured is in [`docs/plan-shipped/04-liquids.md`](../plan-shipped/04-liquids.md), under the same number.

**4a-clock. Clock Glass and Ferro Paint after their references** (**shipped**, #280): a purple water round twelve bodies of oil (`src/lib/oilLay.ts`; `npm run clockglass`, `npm run bodies`), and Ferro Paint's patches at 0.09. Story in `docs/plan-shipped/04-liquids.md` §4a-clock (moved 2026-10-29, 19m-2).

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
