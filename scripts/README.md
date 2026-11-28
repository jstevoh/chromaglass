# scripts

The checks, one script per check (about 265 `.mjs` files), and the helpers they share. Every check CI runs is one entry in `checks.json`; the folder's other scripts are tools (`watch.mjs`, `watchwords.mjs`, `watchoverall.mjs`, `watchpair.mjs`, `watchfootage.mjs`, `watchcard.mjs`, `watchsettings.mjs`, `watchffmpeg.mjs` (which sound encoder the watch self-tests make their clips with, 47x-6), `watchconfig.mjs` (where the watch tool keeps things, from `reelreader.config.json`; [docs/watch.md](../docs/watch.md)), `render-lab.mjs`, `planmove.mjs`, `planarchive.mjs`, `licenserotate.mjs`, `scorecard.mjs`).

## Start here

- `checks.json`: the manifest: `shards` (Measure: `logic`, `sound`, `browser`, `lab`, `lab2`; Mac: `show`, `tools`, `plate`, `open`, `fifth`) and `checks`, each `{name, shard, run, why, always}` and sometimes `env`, `timeout`.
- `checks.mjs`: `runShard`, `selectShards`, `trace`, `checkReads`, `quarantined`, `loadEsbuild`: runs a shard in CI (`--ci <shard>`), says what each check reads (19ak-2) and which red lines are quarantined (19ak-1); `npm run checks` holds the rules.
- `quick.mjs`: `npm run quick` runs the checks your diff from `origin/main` reaches, side by side; `-- --dry` says which and why.
- `chromium.mjs`: `launchChromium`, `chromiumPath`; `PW_WEBGPU=1` gives the app software WebGPU off a Mac.
- `frame.mjs`: `installFrameReader`, `waitForShow`, `settlePlate`, `frameOf`: photograph the plate and wait on the solver.
- `lab.mjs`: `openLab`: the solver in a page with no canvas (`lab-entry.ts`).

## Kinds of check

- **Node harnesses** (`setlist`, `desk`, `plate`, `music`): esbuild bundles the script with the `src/` it imports, or node runs it with `--experimental-strip-types`. No browser.
- **The lab** (`physics`, `maze`, `spikes`, `straw`): `openLab()` loads `lab-entry.ts`, so physics runs on SwiftShader too. Other entries: `sloshgpu-entry.ts`, `areacords-entry.ts`, `render-lab-entry.ts`, `live-entry.ts`, `wgsl-entry.ts`.
- **Two trees** (`samelook`): the lab run in this tree and in a checkout of another commit (`samelook-scenes.mjs`), the same plates compared; the guard a speed-up is held to (PLAN.md 46).
- **App harnesses** (`panel`, `phone`, `layout`, `qa`): Playwright drives the built app at `?debug`. Mac-only ones (`qa`, `gallery`, `moving`, `film`) need Metal's speed.
- **CI's own** (`reach`, `checkguard`, `deploygate`, `closedruns`, `mainhold`, `cisecrets`, `actionlint`, `macqueue`, `sizes`, `syncrules.mjs`).

## How a check drives the app

Under `?debug` the app installs `window.chromaglassDebug()` (a report), `chromaglassSettings(patch)`, `chromaglassAction`, `chromaglassApplyPreset` and others. `src/lib/checkHooks.ts` declares every such name; `LiquidVisualizer.tsx` and `src/app/useCheckHooks.ts` set them. Names starting `window.__cg` are markers: `__cgSeed`, `__cgIntro`, `__cgFadeLog` from the app, and `__cgFrame(w, h)` from `frame.mjs`, which returns a promise, so await it.

A check that reads source as text reads App and its hooks through `appSource.mjs`, and the settings panel and its sections through `settingsSource.mjs`.

## Helpers and files that are not checks

- `lookOrLamp.mjs`: `readsAsLamp`, whether a line quoting a retired look's id that is also a setting or Mixer row (Lumia) names the lamp; `plate` 5b's rule (PLAN 28i-5).
- Shared by several checks: `judge.mjs` (a frame as numbers), `layoutProbe.mjs`, `liquidStandIn.mjs`, `arrangement.mjs` and `band.mjs` (synthesised songs and band), `media-read.mjs` (render containers), `rtmpListener.mjs`, `pagehold.mjs`, `compilestop.mjs` and `startupbehind.mjs` (beside `startup.mjs`, at its size ceiling), `qaDesk.mjs` (beside `qa.mjs`, at its ceiling: the desk's ways to the Band, the looks and Go), `recorder.mjs`.
- CI and the Mac runner: `deploygate.sh`, `mainhold.mjs` (main held red: the status `hold.yml` posts on every open PR), `macrunner.mjs`, `macrunner-hook.sh`, `macrunner-setup.sh`, `macports.sh`, `macbusy.sh`, `macdeploy.mjs` (a deploy shard's hold on the Mac, which `launchChromium` and `npm run desktop` wait for), `maclock.mjs` (one film at a time on the owner's Mac via `~/cg-scratch/film.lock` and `~/cg-scratch/film.queue/`: `acquireFilmLock`, `filmLockStatus`, `withFilmLock`), `debcache.sh`, `chromiumlibs.mjs`, `checkguard-api.mjs`, `measured.mjs`.
- Reports, not checks: `bugbash.mjs` (`npm run bugbash`, PLAN QA-33): every look, every desk panel's controls and the phone's sheets turned end to end, a findings list grouped by area and a film of each serious one; never in `checks.json`, never a gate. `smooth.mjs` (`npm run smooth`, PLAN 50b): plays every look for 30 s with the simulated band on the Mac, records rAF frame times and main-thread tasks over 8 ms, replays the non-native refresh through `rungs-120.mjs`, and writes one worst-first table to `~/chromaglass-films/smooth/<date>-<sha>.md`; never in `checks.json`, never a gate. `sameapp.mjs` (`npm run sameapp`, PLAN 50i): the bug bash's sweep run on main and on a branch with one ruler, compared number for number with tolerances the run checks against the same tree swept twice; nightly on the owner's Mac (`sameapp-nightly.sh`, `npm run sameapp -- install-agent`); only its `--selftest` is in `checks.json`.
- The mutation run (PLAN 50l): `mutate.mjs` (`npm run mutate`) puts each known fault in `mutants.json` back, one at a time, in a worktree of its own (`mutate-tree.sh`), runs the checks that read its file and says which caught it, and lists the ones nothing caught; weekly on the owner's Mac through the film queue (`mutate-weekly.sh`, installed by `mutate-install.sh`). A report, never a gate; its own test, `--self`, is a check. `readmedrift.mjs` (`npm run readmes`) holds each folder's README to its exports (PLAN 50n).
- Data: `sizes.json` (the size baseline, which only shrinks), `fixtures/`, `brand/`.
- Rules sync: `syncrules.mjs` (`npm run rules`) generates `.agents/rules/` from `.claude/rules/`, and `--check` holds them in sync and under 24,000 bytes per file.

## Rules

A check asserts the feature, not a moment of the plate. Never loosen, skip or delete one to get green. A new check is an entry in `checks.json` and its npm script, never a step in `checks.yml`; then `npm run checks` and the `check-skeptic` agent. A changed bar is named under `Check changes:` (`npm run checkguard`).
