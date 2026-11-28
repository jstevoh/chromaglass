# 4. Liquids that behave differently

**Shipped**, with milk's opacity shipped in 18j (#353). How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**Milk's opacity shipped (#353, 18j).** Optical scattering (Kubelka–Munk diffuse backscattering on black ground, two-flux forward extinction and forward halo on lamp ground) packed into `vel.w` from the advected `species.b` field. Colour sits on the opaque white body of milk as solid vibrant red (reference §4).

# 4a. What is in each preset's dish

**Shipped**: what each preset puts in its dish. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**4a-clock. Clock Glass and Ferro Paint after their references** (**shipped**, #280): a purple water round twelve bodies of oil (`src/lib/oilLay.ts`; `npm run clockglass`, `npm run bodies`), and Ferro Paint's patches at 0.09. Story in `docs/plan-shipped.md` §4a-clock (moved 2026-10-29, 19m-2).

- Open from this: **4a-units**. Roy, 1963 lays its shapes the same way (`S × fr` in
  128-grid units, 1.5 times the size meant); its panel may want them halved, by eye.
  **4a-clock-fade** (partly landed 2026-11-28): on a fade (`captureSeed`, `addSeedShare`,
  `seedPresetScaled`), `oilAdd` is now captured, scaled, and shared proportionally alongside
  the dye (`captureWithOil`, `shareWithOil`, `scaledWithOil` in `src/sim/solverLay.ts`:
  Clock Glass `oilAdd` sum `0.2500` at 25% share, `1.0000` at 100% share, `0.4000` at
  `seedPresetScaled(..., 0.4)`). Still open: deferring `mix` (`addMix`/`wait.lay`) from
  `captureSeed` to `addSeedShare` so bodies arrive with the fade too, and adding a fade
  handover case in `scripts/clockglass.mjs` (blocked here by `scripts/oillaid.mjs`, which
  reads Clock Glass's 12 bodies immediately after `captureSeed`). Also unmeasured: the look's own
  doses (`['oil', 'water', 'oil', 'syrup']`, about seven small clear bodies at the
  lay) and the app's finer GPU grid (the check lays at 192², the app runs 384² and up).
  And the automation's drops still land any of a look's dyes anywhere, so over a minute
  the regions blur: where each dye lands belongs to the "more going on in every look"
  work (several areas of interest across the plate), not to these two looks.
