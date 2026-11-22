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
