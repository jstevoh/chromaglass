# Archive: 38. Realism audit: what still imitates, after §18 (continued)

The closed items of [`docs/plan/38-realism-audit-2.md`](../38-realism-audit-2.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 38v. A fourth pass (2026-11-21)

- ~~**38v-4. The spin and the cover read one viscosity and one gap for every layer**~~ — **Shipped** (S;
  Medium; `FluidSimulation.prototype.spinDrag` and `layerSpinDrag`, `npm run turntable`; shared
  `coverDrag` left). `fluidSimulation.ts:3346-3347` takes the spin's ν from `carrierViscosity`
  (1e-6 or 2e-5 m²/s) while the thin gap solves with `thicknessViscosity(0.45)` = 22.4 cSt;
  `LiquidVisualizer.tsx:4815` hands Layer 0's `coverUnits` to every layer, and so do
  `LiquidVisualizer.tsx:4723`, `bubbles.ts:264` and `fluidSimulation.ts:2957`. Nine
  'thin' looks run on that mismatch. The spin's lag time is τ = h²/(12ν), so a ν 22 times
  off is a lag 22 times off. Read ν and the gap per layer from the one place the thin solve
  reads them. Check: for each layer, the spin's ν equals `thicknessViscosity` and the
  cover's gap equals that layer's; `npm run spin` stays green. (38v, from RS-50.)
- ~~**38v-1.**~~ Sound Drive's built-in hands became cords on every look (shipped 2026-11-21,
  `docs/plan-shipped.md` 38v-1). What it left outside a cord is **38x-1** to **38x-7**
  (`38-realism-audit.md`).

## 38w. Classic Light Show as a real dish (2026-11-21)

- ~~**38w-1. Classic laid as oil cells in a coloured water on the lamp**~~ shipped
  (`npm run classicdish`; the story in `docs/plan-shipped.md`).
- ~~**38w-10. Evolve at full speed never moves a dial faster than the slow-change rule**~~
  shipped (S; Medium). Classic's new settings drew particleMix 0.69 to 0.50 over a 5.4 s glide,
  5.3 % of its travel a second (`npm run slowevolve`, red on 917). A move's step is now capped
  to what its glide may cover (DIAL_RATE_MAX, 4 %/s at the smoothstep's peak): 3.99 %/s after.
- ~~**38w-8. Classic's dye laid at the solver's grid, not the CPU's**~~ shipped: the dye and the wash are laid whole at N (FluidInputs.layDye, layShare; `src/sim/solverLay.ts`), classicdish at 384² checks nothing goes through the CPU (M; Medium). The owner asked
  for more detail (2026-11-21), and the lay now packs about forty cells of median radius 0.026
  (`src/lib/oilLay.ts`, CLASSIC_MEDIAN). The oil is laid at the solver's grid (`addMix`), but the
  dye in it and the water's wash are laid on the CPU's 192 grid and carried up (applyDeltas'
  oilAdd), so a cell's colour edge is a 192 cell soft while its oil rim is sharp at 768, and no
  cell can be smaller than 0.018 (3.5 CPU cells) without its colour smearing into the water.
  Lay both at the solver's grid (an oil-share pour like `pourInk` that keeps each cell's own
  colour, not bodyLand's share by the oil, which put each drop's colour in the water: 28k-5),
  then lower CLASSIC_MIN toward the oil's own floor in grid cells. Check: classicdish at 384²
  with cells down to 0.01, every colour still carried.
- ~~**38w-9. Classic's floors in the solver's grid cells**~~ shipped: CLASSIC_FLOOR_CELLS, scaled by the grid the lay sees (S; Low). CLASSIC_GAP (0.02),
  CLASSIC_DROP_MIN (0.014) and the drop's wall are plate units measured at 192², about four
  cells of the Cahn–Hilliard interface there; at the app's 768 they are sixteen. A film four of
  the solver's own cells wide holds as well (the interface is a fixed number of cells), so the
  lanes between cells could close to what the references show. Scale them by the grid the lay
  sees, as Foam Cells' FOAM_FILM does, once classicdish can run at 384².
- ~~**38w-15. Classic's rims one pixel, not the solver's band (Crisp Edges)**~~ shipped
  (S; High): the owner's "complexity and clarity" (2026-11-21). The Cahn–Hilliard interface is a
  tanh about a cell wide, so the oil/water rim drew as a band of mixed colour 7 px wide on a
  1024 wall (median 10–90 rise). The plate now reads each pixel in that band at the pure phase
  on its own side, from the tanh's own distance (`plateInterface.ts`, a new setting Crisp
  Edges, 1 in Classic): 8 px → 1 px median (the one antialiased pixel), `npm run classicdish`'s rim line. A render-side
  reconstruction of the solver's level set, not a change to the solver: 38w-18 is the solver's
  own sharp interface.
- ~~**38w-20. Warm cells still read soft in the app with Crisp Edges on**~~ (fixed 2026-11-22 by 38w-23: the soft warm rims were Edge Relief's dye-slope halo; with Classic's Edge Relief at 0 every cell's rim is the crisp pixel cyan already had, probed on Metal at seed 1) (M; High). Filmed in
  the app on Metal (seed 1, 512² grid, 1280x800 canvas, after 12 s): the cyan cells' rims are
  one crisp pixel, but the red and orange cells' rims are a soft three or four pixels, and
  turning Crisp Edges off leaves them unchanged. Edge Relief adds a broad dark band just inside
  them (it reads the solver's band at `rim0`, unmoved), but Edge Relief at 0 still leaves the
  rim soft, so the relief is not the cause. Not measured yet, two guesses: those cells' oil band
  is wider than 3.5 cells, which `crispInterface`'s `real` gate leaves alone on purpose as real
  diffusion; or their dye has leaked out into the water (about 7% of it in the lab), so the
  colour's edge is not the oil's. First read the band half-width (`eps / h.x`) and the dye
  outside the oil at those rims in the app, then fix the cause in the solver (why warm cells
  spread wider than cyan) and not in the plate. Once the rim is sharp, draw the meniscus as a
  narrow line at the crisp rim (the chain rule through the warp), not as the band-wide halo.
- ~~**38w-21. The look's lay reaches the GPU solver at its first attach**~~ (shipped 2026-11-22,
  `OwedLay` in `src/sim/solverLay.ts`). A look applied before the GPU solver attached laid its
  dish on the CPU's 192² mirror only and the GPU started from the default plate; the lay is now
  owed and taken once by `attachGpu`. `npm run classicdish`'s first line (the dye laid at the
  solver's grid, none on the CPU's).
- ~~**38w-22. Classic's oil poured, not packed**~~ (shipped 2026-11-22, `classicDiscs` in
  `src/lib/oilLay.ts`). The owner, round four: "too symmetric". The drops now fall along
  fourteen random-walk pours with log-normal sizes, a tenth sprayed anywhere, drops in a pour
  joining where they touch, each drop aimed up to twelve times at open water before it counts
  as lost (more pours did not add bodies: crossing paths lost them), and one to three water
  drops held in the big cells. Checked by the spread of the oil's cover over 6 by 4 boxes (at
  least 18% of its mean; 24.9% and 24.2%, packed 5–9%) and 133 and 134 bodies apart (at least 120).
- ~~**38w-23. Edge Relief off in Classic: no dark lattice round the cells**~~ (shipped
  2026-11-22). Probed on Metal (seed 1, 1280x800): Edge Relief 0.6 drew a wide dark halo, squared
  to the grid, round every warm cell, because `refractionOptics` (wgsl/plate.ts) darkens by the
  slope of the dye (shortcut notes 1 and 6) and the warm cells carry the heaviest dye; cyan, at
  the water's density, got none. That halo was both the lattice the owner called too symmetric
  and 38w-20's soft red rims. At 0 the cells are round and crisp. classicdish's meniscus line
  became a no-halo line: the water 2-8 px outside a rim keeps at least 95% of its light against
  Edge Relief 0, and the old 0.6 must fail it. **Shortcut named:** Classic now draws no meniscus
  at all; 38w-25 brings back the oil's own.
- ~~**38w-24. Classic moves: the hand rocks the dish harder**~~ (shipped 2026-11-22). The owner,
  round four: "it needs movement". Filmed at 1280x800, 25 s with the built-in band: at Plate Rock
  0.55 the frame changed by 0.95 grey levels a half-second and 13 from first frame to last; at
  0.8 by 3.25 and 21. The rock is the real one (lib/plateRock.ts: the gap tips, the oil slides
  at Darcy's speed in it), only stronger.
- ~~**38w-30. Classic Light Show is named Lava Pop**~~ (S; shipped 2026-11-23, the owner: the
  old name promised a 1960s show the plate does not look like yet, so a new fun one). Only the
  name shown changes: the preset, the Guide, the song show's example and the docs. The id stays
  `classic`, so saved shows, set lists, song shows and `?look=classic` links still open it; the
  code and the checks still call it Classic in comments. `npm run draw` reads the new name off
  the phone's Draw sheet.
- ~~**38w-31. Every oil has its own thickness**~~ (S; High, Lava Lamp's wax stopped cycling after
  #946). Shipped: #946 made the oil drag in the Hele-Shaw gap (a drop rides the flow at
  2/(1+λ), λ = ρν_oil/ν_water) but baked the oil in as 50 mm²/s mineral oil for every look, so
  Lava Lamp's wax, molten paraffin at about 9 mm²/s at 60 °C (Anton Paar; Prowax 610 3.5–4.5 at
  100 °C), dragged as if five times thicker: 77% of the cold wax stayed up for 3 s and the lamp
  stalled at 0.55 of the height (`npm run lavacycle` 4/7, `npm run lavawax` failing the colour).
  The new Oil Thickness setting (Thickness's scale, default 0.566 = 50 mm²/s, every look as it
  was) reaches hsPrep through the Sim struct's slot 55, the lift and the spin; Lava Lamp sets
  0.32. Measured: lavacycle 7/7 (peaks 0.63 at 18 s, down to 0.15 by 40 s, round again to
  0.62), lavawax 3/3 (25% of the cold wax stays up).
