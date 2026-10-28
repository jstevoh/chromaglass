# scripts

The checks, one script per check, and the helpers they share. Every check CI runs is one entry in `checks.json`; this folder's other scripts are tools (`watch.mjs`, `render-lab.mjs`).

## Start here

- `checks.json`: the manifest: `shards` (Measure: `logic`, `sound`, `browser`, `lab`, `lab2`; Mac: `show`, `tools`, `plate`, `open`, `fifth`) and `checks`, each `{name, shard, run, why, always}`.
- `checks.mjs`: `runShard`, `selectShards`, `trace`: runs a shard in CI (`--ci <shard>`), `npm run checks` holds the rules.
- `quick.mjs`: `npm run quick` runs the checks your diff from `origin/main` reaches, side by side; `-- --dry` says which and why.
- `chromium.mjs`: `launchChromium`, `chromiumPath`; `PW_WEBGPU=1` gives the app software WebGPU off a Mac.
- `frame.mjs`: `installFrameReader`, `waitForShow`, `settlePlate`, `frameOf`: photograph the plate and wait on the solver.

## Kinds of check

- **Node harnesses** (`setlist`, `desk`, `plate`, `music`): esbuild bundles the script with the `src/` it imports, or node runs it with `--experimental-strip-types`. No browser.
- **The lab** (`physics`, `maze`, `spikes`, `straw`): `lab.mjs` `openLab()` loads `lab-entry.ts`, the solver in a page with no canvas, so physics runs on SwiftShader too.
- **App harnesses** (`panel`, `phone`, `layout`, `qa`): Playwright drives the built app at `?debug`. Mac-only ones (`qa`, `gallery`, `moving`, `film`) need Metal's speed.
- **CI's own** (`reach`, `checkguard`, `deploygate`, `closedruns`, `cisecrets`, `actionlint`, `macqueue`).

## How a check drives the app

Under `?debug` the app installs `window.chromaglassDebug()` (a report; `grabFrame`), `chromaglassSettings(patch)`, `chromaglassAction`, `chromaglassApplyPreset` and others (`App.tsx`, `LiquidVisualizer.tsx`). Names starting `window.__cg` are markers: `__cgSeed`, `__cgIntro`, `__cgFadeLog` from the app, and `__cgFrame(w, h)` from `frame.mjs`, which returns a promise, so await it.

## Rules

A check asserts the feature, not a moment of the plate. Never loosen, skip or delete one to get green. A new check is an entry in `checks.json` and its npm script, never a step in `checks.yml`; then `npm run checks` and the `check-skeptic` agent. A changed bar is named under `Check changes:` (`npm run checkguard`).
