# src/sim

The module code that used to sit above the visualizer component (PLAN.md 19ai-3): each
plate layer's `FluidSimulation`, the grid and the solver's constants, the hands' and
bottles' helpers, the step's switches, the dice, and the shapes a frame passes around.
The component in `components/LiquidVisualizer.tsx` imports all of it; nothing here imports
the component.

## Start here

- `fluidSimulation.ts` (172 KB, grep it): `FluidSimulation`, one layer: its seeding
  (`seedPreset`; `addOilDensity` lays a colour as the oil's own, PLAN 47z-1), pours and doses, spin drag (`spinDrag(settings)` returning `{ nu, gap, tau }` for this layer's viscosity and `gpu.coverMetres`, PLAN 38v-4), and the hand-off to the GPU solver (`attachGpu`,
  `dropGpu`, `syncFromGpu`). `oilPending` (`wait.pending` via `mixWait.ts` or `owed.pending` via `solverLay.ts`) says whether a look's oil waits for that solver, which the show asks before it builds its pipelines (`gpu/opening.ts`).
- `frameTypes.ts`: `FrameDigest`, `VisualizerRender`, `FrameView`, `PlateRenderer`,
  `SongShapeReport`, `LookPhase`: the shapes the frame, the song render and the checks share.
  `FrameView.shutters` (optional) carries the projectors' shutter vanes from the stage clocks (PLAN 51a).
- `constants.ts`: `GRID_SIZE`, `GRID_SCALE`, the macro zoom (`macroZoomOf`, the Macro Zoom alone since PLAN QA-32c: `macroMode` no longer floors it at 4x; `MACRO_PRESET_ZOOM`, what a flag-only saved look or stage is given), Turing's rates, the currents.

## Contracts

- The fields themselves live on the GPU (`src/gpu/fluid.ts`); a layer here lays what is
  poured and reads back what it needs. The real-physics rule applies here as in the solver.
- `FluidSimulation.step(settings, time, noise2D)` takes no sound, and `fluidSimulation.ts`
  never names the analyser's data (PLAN 38u-4, 38u-5): the music reaches a step only as the
  settings the patch bay folded, through a cord. `npm run musicstir` fails if that changes.
- Imports `src/lib`, `src/types`, `presets`, `presetPlate`, the `AudioData` type from
  `hooks/useAudioAnalyzer` (`frameTypes.ts` only, for the song render), and from `src/gpu` the solver's types and constants
  (`solverTypes`, `fluid`, `post`, `kit`, `wgsl/magnetDisc`); never `components/`.
- `src/gpu` and `src/lib` never import this folder.
- Checks read these files as text or bundle them: `panel`, `plate`, `oillift`, `cellride`
  and `pacing` read `fluidSimulation.ts`; `frameuploads` and `videoflow` bundle it. A move
  out of it carries their patterns with it.

## Files

- `beadStep.ts`: `stepPlateBeads` (oil bead stepping and live gap/liquid wiring, moved out of `LiquidVisualizer.tsx`, PLAN 18i-2, 19ai-10).
- `constants.ts`: the grid, the macro zoom, Turing's drift, the currents' gains.
- `dice.ts`: `DICE` (seeded randomness; `keep` is Keep Full's, PLAN 18a-22), the palette window.
- `dropSplash.ts`: `layDrop` (a colour drop: on a thin gap its volume and dye queued through lib/dropImpact.ts, else the stamp; its crater, and satellites only past Cossali's K using the falling liquid's own ρ, σ, μ and live `coverMetres` gap, splitting drop dye and volume across central drop and satellites; a last `what` carries the bottle's liquid into every pour, PLAN 18c-13), `dropBottle` (a hand's drop from a bottle: `layDrop` with its liquid, and the bottle's deposit told the volume came already), `layStream` (a stream held on the plate: one held share a step with its colour laid at the strength of a column of the same drop, `dropColumnDye`; the stamp when nothing pours) and `stepPlateDrops` (the drops on their way in, a step at a time), PLAN 18c-2, 18c-3, 18c-10, 18c-13; moved out of `fluidSimulation.ts` with its old `splash()`. `FluidSimulation.autoInject` takes a last `volume` (false for a fresh plate's lay and a bottle whose own pour brought it) and the sim holds `drops`.
- `fluidSimulation.ts`: `FluidSimulation`.
- `hueJourney.ts`: `hueJourneyTurns`, the hue journey's step on the wall clock (moved out of the frame loop with PLAN 18a-22).
- `keepFull.ts`: Keep Full, the dropper topping up a dish left running (PLAN 18a-22): `keepFullState(look)`, `stepKeepFull`, `keepFullDose` (the pure decision), `keepFullHands`, `KEEP_FULL_*`. Lays through `dropBottle` on `DICE.keep`.
- `frameTypes.ts`: the frame's shapes.
- `mixWait.ts`: `mixWait()` (a look's oil laid before its solver is built: kept, played onto the solver when it attaches, put back if that solver goes before it has spoken, dropped on a clear or when a carry holds it; PLAN 27f-9m, `npm run oillaid`).
- `noteVoicesStep.ts`: `handleNoteVoiceEvent`, `queueMelodyDrops`, `stepMelodyAndVoices` (MIDI note voices and Melody Walk stepped into the plate, PLAN 24.3).
- `plateSnapshot.ts`: `buildPlateSnapshot`, `applyPlateSnapshot`, `captureSimSnapshot`, `restoreSimSnapshot` (full GPU + CPU solver, bubble, bead and palette snapshot/restore for 8 s Undo, PLAN 49a).
- `pressLay.ts`: `layPress`, a press's disc laid through `squishCell` and counted by who pressed (moved out of `applySquish`); on a thin gap with `pressBowl` it only counts, the solver holding the bowl (PLAN 18a-14).
- `speciesPoll.ts`: `SpeciesPoller` (`speciesShare` and `speciesSnapshot` polled once a second on a thin gap) and `stepPlateBubbles` (handing the snapshot to `BubbleField` on a thin gap and stepping the bubbles).
- `solverLay.ts`: `layClassicOnSolver` (Classic's dye and oil cells laid at the solver's own grid through `FluidInputs.layDye`, not on the CPU's 192² and carried up bilinearly, which blurred every rim; PLAN 38w-8) and `SolverSeeds` (which captured seeds hold such a lay, so `addSeedShare` sends each share to the solver too through `layShare`, and the dish mean the solver's lay added, which `seedPreset`'s CPU sum cannot see), `SolverSeeds.plain()` (no capture or scaling running), `OwedLay` (a look that lays directly on the solver grid without `mixWait`, `SOLVER_OIL_LOOKS`: `'classic'` and `'foam-cells'`, whose CPU dye is taken back and the look laid again at the first attach that carries no plate; PLAN 38w-21) and `dishMean` (seedPreset's measure of what a look laid).
- `stepping.ts`: the step's pinned grid, timings, `?prepare=0` and recovery switches,
  `resolveSimResolution`, `engineLabel`, `pressSheetKick` (sheet kick with live cover gap).
- `tools.ts`: the hands' settle and hold, the bottles' laying and reach, the pointer's press and stir along a move (`stirAlongMove`), `kickCenter`.

## Checks

`npm run quick`; by hand `lint`, `plate`, `panel`, `pacing`, `cellride`, `oillift`, `musicstir`,
`turing`, `desk`, `phone`; the app's on the Mac.
