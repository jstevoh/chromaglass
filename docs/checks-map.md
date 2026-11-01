# Which checks for which files

Moved out of `CLAUDE.md` (PLAN 19ai-1) because `CLAUDE.md` is loaded on every step of
every session, and `npm run quick` already runs most of this table for you. Read only
the rows for the paths you touched: `grep -n '<path or word>' docs/checks-map.md`.

| You touched | Run before pushing |
|---|---|
| anything | `npm run lint` (typecheck), `npm run sizes` (no new file over 100 KB, a warning past 40 KB; no file already over 100 KB grows; PLAN 19ai-5) |
| `src/gpu/wgsl/*` | `npm run wgsl`, then `physics`, `maze`, `spikes`, `disc` (the magnet's field), `fingers`, `ferrohands`, `domes`, `ferrodye`, `microscope`, `straw`, `derive`, `grating` (anything in the dye's step), `soap` (the mix's soap, `oil.ts`'s marangoniFlux and mixUpdate), `soapbreak` (Soap Breakdown's loss in mixUpdate, `fluid/soap.ts`) as relevant (`physics` takes over five minutes in a cloud session) |
| `src/gpu/wgsl/plate.ts`, `plateThinFilm.ts`, bubbles, `src/lib/bubbles.ts`, `bubbleDye.ts` | `pops`, `straw`, `ferrolook` (the ferrofluid's drawing), `mixer` (the stack's order and grades), `grainedge` (the pigment's grain at the dye's edge), `filmrings` (Thin Film's rings have no corner at the texels), `lampzero` (the before-lamp control finds the lamp's lines by count), `litstage` (each look over a projector's black lifted by a stage wash; `-- --controls` until PLAN 36a is built), and a `look` render |
| `src/lib/lookFade.ts`, presets, set list | `desk`, `setlist`, `panel` |
| areas of the dish and their cords (`src/lib/plateAreas.ts`, `src/lib/areaCords.ts`, a preset's area cords; the indicator's pH, `src/lib/phIndicator.ts`; the hit's regulator, `hitRoomOf` in `src/lib/dyeTarget.ts`) | `areacords` (`-- --node` for the gate and the tables; the lab half with `PW_WEBGPU=1`), `plate`, `desk` |
| settings, panels, desks (`src/components/**`) | `panel`, `desk`; layout at 1440/1280/1024 in a browser |
| Preview's copy (`drafting`, `wallRef` in `src/app/useWallLook.ts`; the visualizer's `draft` and `hidden`), Send to wall | `draftwall` |
| the phone (`src/components/phone/**`, `src/lib/phone.ts`, the touch handlers in `LiquidVisualizer.tsx`) | `phone` (`PW_WEBGPU=1` for the fingers), `layout` |
| sound (`src/lib/plateDrone.ts`, `SoundPanel`, `musicLibrary`, `useAudioAnalyzer`, `lib/earClock.ts`, `lib/audioFeatures.ts`, `lib/handSounds.ts`) | `shelf`, `music`, `ears`, `renders` (what the sound re-renders, and whether the plate hears each frame's reading), `kicks`, `clicks` (a click on the laptop is not a beat; `-- --app` in a browser) |
| the patch bay's cords (`src/lib/sceneMap.ts`, a cord's gate, gain or dragged band; `CordGate` in `lib/areaCords.ts`) | `soundcords` (`-- --controls` until PLAN 30a is built), `scene`, `areacords -- --node` |
| the cartoons (`src/lib/cartoons.ts`, `public/video/cartoons/`, `CartoonShelf.tsx`), the video pour (`pourVideo`, `pourVideoFrom` in `src/app/usePour.ts`) | `cartoons` (a new cartoon gets its row in `public/video/cartoons/SOURCES.md` first), `phone`, `layout` |
| `src/lib/crashLog.ts`, `CrashReportButton.tsx` | `crash` (in a cloud session its device-loss, stall and screenshot checks skip) |
| `server/report-worker.js`, `wrangler.report.toml` | `report-worker` |
| Settings → Feedback (`server/feedback-worker.js`, `feedback-schema.sql`, `wrangler.feedback.toml`, `src/lib/feedback*.ts`, `FeedbackPane.tsx`) | `feedback-worker`, `feedbackpane` (the pane on the desk and the phone), `phone` |
| `scripts/watch.mjs` | `npm run watch -- --selftest` and `codecblip`; `moving`, `gig` and `film` import it (Mac only) |
| `scripts/recorder.mjs` | `moving` and `film` record through it (Mac only; a PR touching it films three looks in `film.yml`) |
| the mixer (`src/lib/mixer.ts`, `MixerPanel.tsx`) | `mixer`, `rowfade` (the take buttons), `panel`, `phone`, `remotemix` (the remote's) |
| the projector's pass (`src/gpu/output.ts`, `src/gpu/wgsl/output.ts`, `src/lib/outputConfig.ts`, `src/lib/plateSources.ts`, `OutputPanel.tsx`) | `map`, `beams`, `wallpattern` and `mixer` (the lab, `PW_WEBGPU=1`), `phone`; `wall` on the Mac |
| the flash guard (`src/lib/flashGuard.ts`, `src/gpu/probe.ts`, `src/gpu/wgsl/probe.ts`) | `wall` on the Mac; its traces alone, no browser: `node --experimental-strip-types scripts/wallflash.mjs` (with `--owed=…` as `scripts/checks.json` runs it) |
| the Live Show (`src/lib/liveShow.ts`, `src/lib/liveStream.ts`, `LiveShowPanel.tsx`, `desktop/live*.js`) | `liveshow`, `livedrop`, `live` (`PW_WEBGPU=1`); what the stream carries: `liveshow -- --stack` (`PW_WEBGPU=1`, about 3.5 min, or the Mac's fifth shard) |
| the iPhone app (`ios/`, `capacitor.config.json`, `src/lib/appLink.ts`, `LaptopLink.tsx`), the remote's link (`remoteProtocol.ts`, `RemoteControl.tsx`, `server/remote-server.js`), the Phone · iPad panel | `applink`, `remotemix`, `phonelink` (the panel's code, and the relay's count of phones); the app's Xcode build runs in `ios.yml`, and on a phone by hand (`docs/judging.md` §16) |
| the Mac app (`desktop/`, `scripts/desktop.mjs`), and what it leans on: `useProjector`, `useCastSession`, `CastDisplay`, `server/remote-server.js` | `desktop` (`npm --prefix desktop install` once; `-- --packaged` after `npm --prefix desktop run pack`); `desktop.yml` checks the packed app on a Mac |
| the governor (`src/lib/governor.ts`) or what the loop feeds it | `rungs` (the ladder, the policy, and Poster's measured costs replayed); `stutter` on the Mac (two-step frames per look) |
| a new or changed setting | `panel`, `desk`, and the `setting-auditor` agent |
| a new or changed check in `scripts/` | that check, and the `check-skeptic` agent; a new one is an entry in `scripts/checks.json` (its shard, its command, why), never a step in `checks.yml`, then `npm run checks` |
| `.github/workflows/deploy.yml`, `scripts/deploygate.sh` | `npm run deploygate -- --history 20` (which recent merges the deploy would have trusted), `npm run actionlint` |
| `.github/workflows/checks.yml`, `scripts/reach.mjs`, `scripts/checks.mjs`, `scripts/checks.json` | `npm run checks`, `npm run reach`, `npm run closedruns`, `npm run cisecrets` (any workflow: keys only in main's environments, read-only tokens, pinned outside actions), `npm run actionlint` (a pinned release, fetched on first use); `npm run macqueue -- --hours 24` for the Mac time before and after |
| a check's bar or input under `scripts/`, or a SHOUTING_CASE number in `src/gpu/` | name each under `Check changes:` in the PR body (`docs/handoff.md`); `npm run checkguard -- --base origin/main --body-file <body>` says what it wants |
| `scripts/qa.mjs` | `node --check scripts/qa.mjs`; read every new `page.evaluate` for a missing `await` (`window.__cgFrame` returns a promise) |

`npm run quick` is this table made executable (PLAN 19k): it reads
`scripts/checks.json`, works out what each check reads (its scripts, the `src/` files
they import, every site file for a check that serves the app) and runs, side by side,
the checks your diff from `origin/main` reaches and a cloud session can run; `-- --dry`
says which and why. The rows above stay for what it cannot see: agents, pictures, the Mac.

The `panel` check greps the source for `npm run <name>` and fails if `<name>` is
not a script. Write "`npm run qa`" in a comment, never "npm run qa:".
