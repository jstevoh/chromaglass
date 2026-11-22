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
