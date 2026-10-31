# src/sim

The module code that used to sit above the visualizer component (PLAN.md 19ai-3): each
plate layer's `FluidSimulation`, the grid and the solver's constants, the hands' and
bottles' helpers, the step's switches, the dice, and the shapes a frame passes around.
The component in `components/LiquidVisualizer.tsx` imports all of it; nothing here imports
the component.

## Start here

- `fluidSimulation.ts` (194 KB, grep it): `FluidSimulation`, one layer: its seeding
  (`seedPreset`), pours and doses, and the hand-off to the GPU solver (`attachGpu`,
  `dropGpu`, `syncFromGpu`).
- `frameTypes.ts`: `FrameDigest`, `VisualizerRender`, `FrameView`, `PlateRenderer`,
  `SongShapeReport`, `LookPhase`: the shapes the frame, the song render and the checks share.
- `constants.ts`: `GRID_SIZE`, `GRID_SCALE`, the macro zoom, Turing's rates, the currents.

## Contracts

- The fields themselves live on the GPU (`src/gpu/fluid.ts`); a layer here lays what is
  poured and reads back what it needs. The real-physics rule applies here as in the solver.
- Imports `src/lib`, `src/types`, `presets`, `presetPlate`, the `AudioData` type from
  `hooks/useAudioAnalyzer`, and from `src/gpu` the solver's types and constants
  (`solverTypes`, `fluid`, `post`, `kit`, `wgsl/magnetDisc`); never `components/`.
- `src/gpu` and `src/lib` never import this folder.
- Checks read these files as text or bundle them: `panel`, `plate`, `oillift`, `cellride`
  and `pacing` read `fluidSimulation.ts`; `frameuploads` and `videoflow` bundle it. A move
  out of it carries their patterns with it.

## Files

- `constants.ts`: the grid, the macro zoom, Turing's drift, the currents' gains.
- `dice.ts`: `DICE` (seeded randomness), the palette window.
- `fluidSimulation.ts`: `FluidSimulation`.
- `frameTypes.ts`: the frame's shapes.
- `stepping.ts`: the step's pinned grid, timings, `?prepare=0` and recovery switches,
  `resolveSimResolution`.
- `tools.ts`: the hands' settle and hold, Blow's straw, the bottles' laying and reach.

## Checks

`npm run quick`; by hand `lint`, `plate`, `panel`, `pacing`, `cellride`, `oillift`,
`turing`, `desk`, `phone`; the app's on the Mac.
