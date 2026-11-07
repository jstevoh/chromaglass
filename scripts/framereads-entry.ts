// Bundled into the lab page by `npm run framereads` (scripts/framereads.mjs):
// the lab, plus one plate kept across frames (scripts/lab-plateframes.ts) for
// the owed lines of H2c-6 and H2c-9 (scripts/framereads-owed.mjs). An entry of
// its own rather than a member of lab-entry.ts, so that what this check needs
// does not reach every check that loads the lab. The plate's clock is held at
// nought: the lines compare a kept plate's picture with a fresh plate's of the
// same fields, and neither must move with time.
import './lab-entry.ts';
import { plateFrames } from './lab-plateframes';
import type { WebGPUFluid } from '../src/gpu/fluid';

const w = window as unknown as { lab: { solver(): WebGPUFluid; frames?: ReturnType<typeof plateFrames> } };
w.lab.frames = plateFrames(() => {
  const solver = w.lab.solver();
  return { solver, N: solver.N, time: 0, cellClock: 0, magnets: [] };
});
