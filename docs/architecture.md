# Architecture: loading one domain at a time

Why the code is being split, what was measured, and the order the splits go in
(PLAN.md 19ai). The rules every session follows are in `CLAUDE.md` under *Where things
live*, *Boundaries*, *Size budgets* and *Planning a change*.

## Why

A session sends its whole context again on every step, so everything it reads it pays
for on every step after (`CLAUDE.md`, *Keeping a session small*). What drives that is
how much a session must read to find its place, and the biggest files make that a lot.
File size alone costs nothing; what costs is a session paging through a file to learn
where a thing lives. A short map per folder, and modules small enough to read whole,
turn a 50 KB hunt into a 2 KB read.

## Measured on `main` a9dd9f2, 2026-10-28 (about 4 bytes a token)

| File | Size | What is in it |
|---|---|---|
| `PLAN.md` | 810 KB, ~200k tokens | More than a session's 200k window. The order of work a session reads first is 38 KB. 14 of 25 recorded merge conflicts (19m) |
| `src/components/LiquidVisualizer.tsx` | 671 KB | `class FluidSimulation` (lines 1066-4983, 192 KB: each layer's seeding, pours and hand-off to the GPU solver); 63 KB of other module-level helpers; the component (99 KB); the frame loop, one `useEffect` of 5,469 lines (310 KB) |
| `src/App.tsx` | 373 KB | `App()` is 6,600 lines: 51 `useState`, 54 `useRef`, 70 `useEffect`, 124 imports |
| `src/gpu/fluid.ts` | 291 KB | the solver, about 95 methods |
| `src/gpu/wgsl/fluid.ts` | 290 KB | the solver's passes in 7 exports (other passes already have their own files) |
| `src/components/SettingsPanel.tsx` | 204 KB | every settings section |
| `CLAUDE.md` | 17 KB, now 14 KB | loaded on every step of every session |

Also found: the checks drive the app through 38 `window.chromaglass*` and `__cg*` hooks,
read by 68 check scripts and declared nowhere; and `lib/stir`, `squish`, `plateRock` and
`turntable` import types from the visualizer component. Already sound: `src/gpu/` never
imports components or hooks, and `src/lib/` never imports components.

## The splits, ranked by context saved per effort

Each is a pure move: no change to how the plate looks or behaves, the checks the moved
code reaches green, bytes before and after in the commit message. One PR each, started
when no open PR touches the file.

| # | PLAN | Move | Effort |
|---|---|---|---|
| 1 | 19m | `PLAN.md` to an index plus one file per section | M |
| 2 | 19ai-1 | `CLAUDE.md`'s checks table and CI account to `docs/checks-map.md` and `docs/ci.md`; the architecture rules in (shipped) | S |
| 3 | 19ai-2 | a `README.md` per folder: what it owns, its entry files, its contracts, its checks (shipped) | S |
| 4 | 19ai-3 | `FluidSimulation` and the module-level helpers out of `LiquidVisualizer.tsx`; its shared types to a types file | S |
| 5 | 19ai-4 | the checks' `window` hooks declared in one typed file | S |
| 6 | 19ai-5 | `npm run sizes`: a new file under 40 KB, a file over budget may not grow | S |
| 7 | 19ai-6 | `src/gpu/wgsl/fluid.ts` split by pass | M |
| 8 | 19ai-7 | `src/gpu/fluid.ts` split into setup and per-pass encoding | M |
| 9 | 19ai-8 | `App()` into domain hooks: account and licence, set list, cast and projector, MIDI | M-L |
| 10 | 19ai-9 | `SettingsPanel.tsx` one file per section, the phone on the same contract | M |
| 11 | 19ai-10 | the frame loop, one piece at a time, as PRs touch it | L, spread out |
