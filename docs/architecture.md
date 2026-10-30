# Architecture: loading one domain at a time

Why the code is split the way it is, which domain owns what, what was measured, and the
splits still to do (PLAN 19ai). The short rules every session follows are in `CLAUDE.md`
under *Where things live*; each folder's `README.md` says what it owns, its entry files,
its contracts and its checks.

## Why

A session sends its whole context again on every step, so everything it reads it pays
for on every step after (`CLAUDE.md`, *Keeping a session small*). What drives that is
how much a session must read to find its place. File size alone costs nothing; what
costs is a session paging through a file to learn where a thing lives. A short map per
folder, and modules small enough to read whole, turn a 50 KB hunt into a 2 KB read.

## Which domain owns what

| Domain | Owns | Start at |
|---|---|---|
| Fluid physics | the fields and how they move | `src/gpu/fluid.ts` and `src/gpu/fluid/` (the solver), `src/gpu/wgsl/fluid.ts` and `src/gpu/wgsl/fluid/` (its passes), `src/sim/` (`FluidSimulation`: each layer's seeding and pours, handed to the solver; the frame's shapes in `frameTypes.ts`), `lib/bubbles`, `beads`, `soapFilm`, `turntable` |
| Rendering | how the fields are drawn and projected | `src/gpu/wgsl/plate.ts`, `src/gpu/plate.ts`, `src/gpu/output.ts`, `lib/outputConfig`, `lib/plateSources`, `lib/mixer` |
| Sound | readings from the audio, and the cords that carry them | `hooks/useAudioAnalyzer.ts`, `lib/audioFeatures`, `lib/earClock`, `lib/sceneMap` (cords), `lib/areaCords`, `lib/plateDrone` |
| Show | looks, set lists, MIDI, the frame loop | `src/presets.ts`, `lib/lookFade`, `lib/setList`, `lib/midi`, the frame loop in `LiquidVisualizer.tsx` |
| Desks | app state, settings and panels | `App.tsx` and its hooks in `src/app/`, `components/desk/`, `SettingsPanel.tsx` and its sections in `components/settings/` |
| Phone | the phone and iPad layout | `components/phone/`, `lib/phone`, the touch handlers in `LiquidVisualizer.tsx` |
| Accounts and licence | sign-in, keys, tiers, the Workers | `lib/firebaseAuth`, `lib/accountLicense`, `lib/licenseKey`, `lib/tierGates`, `server/` |
| Mac app | the Electron shell, projector, updates | `desktop/`, `lib/macApp`, `hooks/useProjector`, `hooks/useCastSession` |
| iPhone app and remote | the Capacitor app, the laptop link | `ios/`, `lib/appLink`, `lib/remoteProtocol`, `components/RemoteControl.tsx`, `server/remote-server.js` |
| Checks | one script per check | `scripts/checks.json`, `scripts/<name>.mjs`, the app's `window.chromaglass*` and `__cg*` hooks, declared in `src/lib/checkHooks.ts` |

A module-level `let` is for a true singleton (auth, crash log, licence) and says so in the
file's header. In the frame loop and the solver a frame is 16 ms, and an allocation per
frame shows up as stutter, which is why *no ceremony in the frame* is a rule and not a taste.

## Measured

On `main` a9dd9f2 (2026-10-28), when the plan was made, and on 422568f (2026-10-30),
after the splits below; about 4 bytes a token.

| File | 2026-10-28 | 2026-10-30 | What changed |
|---|---|---|---|
| `PLAN.md` | 810 KB | 48 KB | an index; each section a file under `docs/plan/` (19m) |
| `src/components/LiquidVisualizer.tsx` | 671 KB | 434 KB | `FluidSimulation` and the module helpers to `src/sim/` (19ai-3); the frame loop, one `useEffect` of about 5,500 lines, is still in it (19ai-10) |
| `src/App.tsx` | 373 KB | 215 KB | `App()`'s domains to 34 hooks in `src/app/` (19ai-8) |
| `src/gpu/fluid.ts` | 291 KB | 100 KB | a class chain in `src/gpu/fluid/`, each file under 44 KB (19ai-7) |
| `src/gpu/wgsl/fluid.ts` | 290 KB | an index | one file per pass in `src/gpu/wgsl/fluid/`, each under 31 KB (19ai-6) |
| `src/components/SettingsPanel.tsx` | 204 KB | 24 KB | one file per section in `src/components/settings/` (19ai-9) |
| `CLAUDE.md` | 17 KB | 12 KB | the checks table to `docs/checks-map.md`, CI to `docs/ci.md` (19ai-1) |

Also found on 10-28: the checks drove the app through `window.chromaglass*` and `__cg*`
hooks declared nowhere (44 of them; now typed in `src/lib/checkHooks.ts`, 19ai-4), and
`hooks/useSongRender.ts` imported the visualizer component for its types. Already sound:
`src/gpu/` never imports components or hooks, and `src/lib/` never imports components.

## The splits

Each is a pure move: no change to how the plate looks or behaves, the checks the moved
code reaches green, bytes before and after in the commit message, one PR each, started
when no open PR touches the file.

| PLAN | Move | State |
|---|---|---|
| 19m | `PLAN.md` to an index plus one file per section | shipped; the archive by section is 19m-3 |
| 19ai-1 | `CLAUDE.md`'s checks table and CI account out; the architecture rules in | shipped |
| 19ai-2 | a `README.md` per folder | shipped |
| 19ai-3 | `FluidSimulation` and the module helpers out of `LiquidVisualizer.tsx` | shipped |
| 19ai-4 | the checks' `window` hooks declared in one typed file | shipped |
| 19ai-5 | `npm run sizes`: fail past 100 KB, warn past 40 KB, a file over budget may not grow | shipped |
| 19ai-6 | `src/gpu/wgsl/fluid.ts` split by pass | shipped |
| 19ai-7 | `src/gpu/fluid.ts` split into a class chain | shipped |
| 19ai-8 | `App()` into domain hooks | shipped; what stayed is 19ai-8a, 8b |
| 19ai-9 | `SettingsPanel.tsx` one file per section | shipped; its props are 19ai-9a |
| 19ai-10 | the frame loop, one piece at a time, as PRs touch it | open, spread out |
| 19ai-5b | `docs/plan-shipped.md` (810 KB), `docs/guide.md`, `docs/judging.md` by part | open |
